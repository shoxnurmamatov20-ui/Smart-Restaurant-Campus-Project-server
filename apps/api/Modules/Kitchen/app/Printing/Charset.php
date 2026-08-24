<?php

declare(strict_types=1);

namespace Modules\Kitchen\Printing;

/**
 * Getting three languages onto a printer that speaks one byte at a time.
 *
 * A thermal printer holds a single 256-character page at a time and is told
 * which one with `ESC t n`. There is no page containing both Cyrillic and the
 * two letters modern Uzbek is written with — `oʻ` and `gʻ` — because those use
 * U+02BB MODIFIER LETTER TURNED COMMA, which is Unicode-era punctuation and
 * predates no codepage at all.
 *
 * That is not a theoretical problem. Untreated, `Choyxona "Oʻzbegim"` prints as
 * `Choyxona "O?zbegim"`, and a menu full of `gʻoz`, `qoʻy` and `shoʻrva` comes
 * out peppered with question marks on every receipt the platform will ever
 * produce. The fix is small and has to happen somewhere, so it happens here,
 * once, rather than being rediscovered per renderer.
 *
 * Two conversions, in this order:
 *
 *  1. **Normalise.** Typographic characters that have an ASCII twin become it —
 *     the turned comma, the curly quotes, the em dash, the ellipsis, `№`. This
 *     is lossless in the only sense that matters: `qoʻy` and `qo'y` are the same
 *     word, and one of them prints.
 *  2. **Encode.** What is left goes to the printer's page. Cyrillic survives in
 *     `cp866` and `cp1251`; under `ascii` it is transliterated, because a
 *     printer with no Cyrillic page is a real thing on a shop floor and a column
 *     of `?` is worse than `Kuk choy`.
 *
 * After normalisation every character the platform emits occupies exactly one
 * byte on the page. That is load-bearing: {@see Document} wraps text at a column
 * count using `mb_strlen`, and the wrap is only correct if characters and bytes
 * agree.
 */
final class Charset
{
    /**
     * `ESC t n` — the page number each codepage answers to on an Epson-compatible
     * printer, which is what every clone in this market imitates.
     */
    private const ESC_T = [
        'cp866' => 17,
        'cp1251' => 46,
        'ascii' => 0,   // PC437: the page every printer has.
    ];

    /** What mbstring calls them. */
    private const MB = [
        'cp866' => 'CP866',
        'cp1251' => 'Windows-1251',
        'ascii' => 'ASCII',
    ];

    /**
     * Characters no printer page has, and what they become.
     *
     * The first two rows are the whole reason this class exists.
     *
     * @var array<string, string>
     */
    private const NORMALISE = [
        // Uzbek Latin: the tutuq belgisi and the sign on oʻ / gʻ.
        'ʻ' => "'",   // U+02BB modifier letter turned comma
        'ʼ' => "'",   // U+02BC modifier letter apostrophe
        'ʹ' => "'",   // U+02B9 modifier letter prime
        '‘' => "'", '’' => "'", '‚' => ',', '‛' => "'",
        '“' => '"', '”' => '"', '„' => '"', '«' => '"', '»' => '"',
        '–' => '-', '—' => '-', '−' => '-', '‑' => '-',
        '…' => '...', '№' => 'N', '•' => '*', '·' => '*',
        '™' => 'TM', '©' => '(c)', '®' => '(r)', '°' => ' ',
        // A non-breaking space is not on any page; it prints as a question mark
        // in the middle of a price, which is exactly where it is least welcome.
        "\u{00A0}" => ' ', "\u{202F}" => ' ', "\u{2009}" => ' ',
    ];

    /**
     * Cyrillic to Latin, for a printer with no Cyrillic page.
     *
     * Uzbek Cyrillic first — `ў`, `қ`, `ғ`, `ҳ` are the four letters Russian does
     * not have and the four a naive table drops. Longest keys first is not
     * needed here because `strtr` with an array already prefers longer matches.
     *
     * @var array<string, string>
     */
    private const TRANSLITERATE = [
        'ў' => "o'", 'Ў' => "O'", 'қ' => 'q', 'Қ' => 'Q',
        'ғ' => "g'", 'Ғ' => "G'", 'ҳ' => 'h', 'Ҳ' => 'H',
        'а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd', 'е' => 'e',
        'ё' => 'yo', 'ж' => 'j', 'з' => 'z', 'и' => 'i', 'й' => 'y', 'к' => 'k',
        'л' => 'l', 'м' => 'm', 'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r',
        'с' => 's', 'т' => 't', 'у' => 'u', 'ф' => 'f', 'х' => 'x', 'ц' => 'ts',
        'ч' => 'ch', 'ш' => 'sh', 'щ' => 'sh', 'ъ' => "'", 'ы' => 'i', 'ь' => '',
        'э' => 'e', 'ю' => 'yu', 'я' => 'ya',
        'А' => 'A', 'Б' => 'B', 'В' => 'V', 'Г' => 'G', 'Д' => 'D', 'Е' => 'E',
        'Ё' => 'Yo', 'Ж' => 'J', 'З' => 'Z', 'И' => 'I', 'Й' => 'Y', 'К' => 'K',
        'Л' => 'L', 'М' => 'M', 'Н' => 'N', 'О' => 'O', 'П' => 'P', 'Р' => 'R',
        'С' => 'S', 'Т' => 'T', 'У' => 'U', 'Ф' => 'F', 'Х' => 'X', 'Ц' => 'Ts',
        'Ч' => 'Ch', 'Ш' => 'Sh', 'Щ' => 'Sh', 'Ъ' => "'", 'Ы' => 'I', 'Ь' => '',
        'Э' => 'E', 'Ю' => 'Yu', 'Я' => 'Ya',
    ];

    public static function isKnown(string $codepage): bool
    {
        return isset(self::MB[$codepage]);
    }

    /** The `ESC t` page number to select before printing anything. */
    public static function pageFor(string $codepage): int
    {
        return self::ESC_T[$codepage] ?? self::ESC_T['ascii'];
    }

    /**
     * Text a printer can lay out: one byte per character, no surprises.
     *
     * Done before wrapping, never after — `oʻ` is two Unicode characters and one
     * printed character, so a line wrapped first and normalised second comes out
     * a column short.
     */
    public static function normalise(string $text, string $codepage = 'cp866'): string
    {
        $text = strtr($text, self::NORMALISE);

        if ($codepage === 'ascii') {
            $text = strtr($text, self::TRANSLITERATE);
        }

        return $text;
    }

    /**
     * Normalised text as bytes on the printer's page.
     *
     * Anything still unmappable becomes `?` rather than being dropped: a missing
     * character is a word a cook misreads, and a visible one is a bug report.
     */
    public static function encode(string $text, string $codepage = 'cp866'): string
    {
        $normalised = self::normalise($text, $codepage);
        $target = self::MB[$codepage] ?? self::MB['ascii'];

        $previous = mb_substitute_character();
        mb_substitute_character(0x3F); // '?'

        try {
            return mb_convert_encoding($normalised, $target, 'UTF-8');
        } finally {
            mb_substitute_character($previous);
        }
    }
}
