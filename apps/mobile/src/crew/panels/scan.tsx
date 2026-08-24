import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { copy, STORE_COPY } from '@restaurant/surfaces/crew/copy';
import { type Lang } from '@restaurant/surfaces/crew/data';

import { Failure } from '../../lib/api';
import { useTheme } from '../../lib/theme-context';
import { size } from '../../theme';
import { sans, text } from '../../type';
import { Button, Empty, PRESSED } from '../../ui/primitives';
import { Chip, Note, SectionLabel } from '../bits';
import { useFlash } from '../flash';
import { baseUnits, inPurchaseUnits, itemForBarcode, type Ingredient } from '../inventory';
import { enqueue } from '../queue';
import { fillScan, scanWord } from '../scan-copy';

/**
 * The barcode screen, with a camera behind it.
 *
 * This used to be a button labelled "Demo: read the next code" cycling four
 * fixture EAN-13s, and the note above it said why: *"what is missing is the
 * reader, and it is a device capability rather than an endpoint"*. That was
 * true of a browser and never of this build. `expo-camera` ships in the binary
 * — the guest surface already reads table QR codes with it — and `CameraView`
 * decodes EAN-13 and EAN-8 natively on both platforms, no WASM and no licence
 * decision. The other half was `GET /inventory/items?barcode=`, which exists.
 *
 * ---------------------------------------------------------------------------
 * Why the book quantity stays hidden until a figure has been typed
 *
 * `CountPanel` states the rule the storekeeper's screens are built on: *the
 * system quantity is deliberately hidden — count first, and the system works
 * out the variance.* A screen that showed "we think there are 12 kg" beside an
 * empty field is a screen that collects the number it printed, and a stocktake
 * that agrees with the books by construction is not a stocktake.
 *
 * So identification and quantity are separated. The moment a code resolves, the
 * screen shows **what it is** — name, SKU, the unit it is bought in — which is
 * everything needed to confirm the right box is in hand. The **on-hand figure
 * and the variance appear only once a count has been entered**, which is when
 * they stop being a prompt and start being a check.
 *
 * ---------------------------------------------------------------------------
 * Four ways this fails, and four different things to do about them
 *
 *   · **permission not granted** — a card that says what the camera is for
 *     before asking for it, because iOS asks once per install. Refused for
 *     good, the only honest control opens Settings; typing the code stays
 *     available throughout, so a refused camera never blocks the work.
 *   · **no camera at all** — a simulator, or a lens the OS would not hand over.
 *     `onMountError` is the only thing that says so, and it is told apart from
 *     a refusal because nobody can grant a camera that is not there.
 *   · **the code is not in the store** — `scanUnknown`, and the camera resumes.
 *     An unregistered barcode is an ordinary answer, not an error.
 *   · **the request never arrived** — a stockroom is the one room in a
 *     restaurant where the signal dies, so this is the common failure here.
 *     Said as its own sentence with the code preserved and a retry beside it:
 *     told "unknown code" when the truth is "no network", a storekeeper books
 *     the delivery against nothing.
 *
 * Nothing here is a spinner that never ends. Every state has either a control
 * or a sentence naming what happened.
 *
 * ---------------------------------------------------------------------------
 * Where a saved count goes
 *
 * Into the phone's own queue as `count_submit`, not straight to the server.
 * That is the staff app's whole idiom (`crew/queue.ts`) and it is exactly right
 * here: the walk-in freezer has no signal, the count has to survive being taken
 * there, and `drain()` hands it over when there is a connection. The payload is
 * `{ingredient_id, counted}` in base units — the shape
 * `StaffActionController::countIn()` reads, which posts the difference through
 * `StockLedger::recordCount()`. One entry per line, so one rejected ingredient
 * cannot strand the eleven counted beside it.
 */

/** A line the storekeeper has counted and not yet saved. */
type Counted = {
  item: Ingredient;
  /** Base units — grams, millilitres, pieces. What the server is told. */
  counted: number;
  /** What they actually typed, kept so the field can be reopened as it was. */
  typed: string;
};

/** What the screen is doing about the code it last read. */
type Lookup =
  | { state: 'idle' }
  | { state: 'looking'; code: string }
  | { state: 'found'; code: string; item: Ingredient }
  | { state: 'unknown'; code: string }
  | { state: 'failed'; code: string; reason: 'offline' | 'refused' };

export function ScanScreen({ lang }: { lang: Lang }) {
  const c = useTheme();
  const t = copy(STORE_COPY, lang);
  const flash = useFlash();

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraBroke, setCameraBroke] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [count, setCount] = useState('');
  const [lines, setLines] = useState<readonly Counted[]>([]);
  const [saved, setSaved] = useState(false);

  /*
   * A barcode in view fires a frame ten times a second. Without a latch the
   * first read starts a lookup and the next nine start nine more — against the
   * same code, over a connection that is already the weakest thing in the room.
   */
  const busy = useRef(false);

  const read = (code: string) => {
    if (busy.current || saved) return;

    busy.current = true;
    void resolve(code);
  };

  async function resolve(code: string) {
    setLookup({ state: 'looking', code });
    setCount('');

    try {
      const item = await itemForBarcode(code);

      setLookup(item === null ? { state: 'unknown', code } : { state: 'found', code, item });
    } catch (error) {
      /*
       * `lib/api.ts` throws rather than answering null, and the distinction it
       * keeps is the one that matters here: a 403 is a permission a manager
       * fixes, and everything else is a connection that will come back.
       */
      const refused = error instanceof Failure && (error.status === 401 || error.status === 403);

      setLookup({ state: 'failed', code, reason: refused ? 'refused' : 'offline' });
    }
  }

  /** Back to the viewfinder, and the next frame is allowed to fire. */
  const resume = () => {
    setLookup({ state: 'idle' });
    setCount('');
    busy.current = false;
  };

  const keep = (item: Ingredient) => {
    const base = baseUnits(count, item.factor);

    if (base === null) return;

    if (lines.some((line) => line.item.id === item.id)) {
      flash(scanWord('already', lang), 'problem');

      return;
    }

    setLines((current) => [...current, { item, counted: base, typed: count }]);
    flash(`${t.scanFound}: ${item.name}`);
    resume();
  };

  const save = () => {
    if (saved || lines.length === 0) return;

    setSaved(true);

    /*
     * One entry per line rather than one for the sheet. `count_submit` names a
     * single ingredient, and the server answers per entry — so a line the store
     * has since deleted comes back `unknown_ingredient` on its own instead of
     * refusing the eleven counted beside it.
     */
    for (const line of lines) {
      enqueue(t.countSaved, `${line.item.name} · ${line.typed} ${line.item.purchaseUnit}`, {
        kind: 'count_submit',
        payload: { ingredient_id: line.item.id, counted: line.counted },
      });
    }

    flash(scanWord('queued', lang));
  };

  /* ---------------------------------------------------------------- states */

  const canScan = permission !== null && permission.granted && !cameraBroke && !typing;

  return (
    <FlatList
      data={lines}
      keyExtractor={(line) => String(line.item.id)}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          {/*
           * Once the sheet is saved there is nothing left to point at, so the
           * whole top of the screen goes. Checked before the camera and before
           * the gate: a saved sheet with a working camera would otherwise fall
           * through to the permission card and ask, absurdly, for a camera it
           * has already been using.
           */}
          {saved ? null : canScan ? (
            <Viewfinder onRead={read} onBroken={() => setCameraBroke(true)} hint={t.scanHint} />
          ) : (
            <Gate
              lang={lang}
              permission={permission}
              cameraBroke={cameraBroke}
              typing={typing}
              typed={typed}
              onTyped={setTyped}
              onAsk={() => void requestPermission()}
              onSettings={() => void Linking.openSettings()}
              onType={() => setTyping(true)}
              onCamera={() => {
                setTyping(false);
                setCameraBroke(false);
              }}
              onSubmit={() => {
                const code = typed.trim();

                if (code === '') return;

                setTyped('');
                busy.current = true;
                void resolve(code);
              }}
            />
          )}

          <Result
            /* The same rule: a saved sheet must not still be offering to add a
               line to it. */
            lookup={saved ? { state: 'idle' } : lookup}
            lang={lang}
            count={count}
            onCount={setCount}
            onKeep={keep}
            onResume={resume}
            onRetry={(code) => void resolve(code)}
          />

          <SectionLabel>
            {lines.length === 0
              ? t.scanFound
              : fillScan(scanWord('waiting', lang), { n: lines.length })}
          </SectionLabel>
        </View>
      }
      ListEmptyComponent={<Empty title={scanWord('empty', lang)} body={t.scanHint} />}
      renderItem={({ item: line }) => (
        <View style={s.row}>
          <View style={s.main}>
            <Text style={[text.small, s.strong, { color: c.fg }]} numberOfLines={1}>
              {line.item.name}
            </Text>
            <Text style={[text.caption, text.num, { color: c.fgSubtle, marginTop: 2 }]}>
              {line.item.sku} · {line.counted} {line.item.unit}
            </Text>
          </View>

          <Text style={[text.small, text.num, s.strong, { color: c.fg }]}>
            {line.typed} {line.item.purchaseUnit}
          </Text>

          {saved ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={scanWord('remove', lang)}
              onPress={() => setLines((current) => current.filter((row) => row !== line))}
              style={({ pressed }) => [s.remove, pressed && s.pressed]}
            >
              <Text style={[text.small, { color: c.danger600 }]}>×</Text>
            </Pressable>
          )}
        </View>
      )}
      ItemSeparatorComponent={() => <View style={[s.rule, { backgroundColor: c.divider }]} />}
      ListFooterComponent={
        <View>
          <Button style={s.action} disabled={saved || lines.length === 0} onPress={save}>
            {saved ? t.countSaved : t.finish}
          </Button>

          {/* The blind-count rule, in the design's own words, kept visible on the
              screen it is being enforced on. */}
          <Note>{t.hidden}</Note>
          <Note>{t.countNote}</Note>
        </View>
      }
    />
  );
}

/* ============================================================
   The camera
   ============================================================ */

function Viewfinder({
  onRead,
  onBroken,
  hint,
}: {
  onRead: (code: string) => void;
  onBroken: () => void;
  hint: string;
}) {
  const c = useTheme();

  return (
    <View>
      <View style={[s.lens, { backgroundColor: c.n900, borderRadius: size.radiusLg }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          /*
           * Three symbologies and no more. EAN-13 is what a wholesale case
           * carries and EAN-8 is what a small package carries; QR is here
           * because a restaurant's own printed shelf labels are QR and a
           * scanner that refused them would send somebody back to the keyboard.
           * Everything else `BarcodeType` offers — PDF417, ITF-14, Codabar — is
           * a symbology nothing in a stockroom wears, and each one added is one
           * more thing the decoder can mistake a smudge for.
           */
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'qr'] }}
          onBarcodeScanned={({ data }) => onRead(data)}
          // The one signal that a camera is absent rather than refused. A
          // simulator reaches exactly here.
          onMountError={onBroken}
        />

        <View style={s.frameWrap} pointerEvents="none">
          <View style={[s.frame, { borderColor: c.n0, borderRadius: size.radiusMd }]} />
        </View>
      </View>

      <Note>{hint}</Note>
    </View>
  );
}

/* ============================================================
   Everything that is not a working camera
   ============================================================ */

function Gate({
  lang,
  permission,
  cameraBroke,
  typing,
  typed,
  onTyped,
  onAsk,
  onSettings,
  onType,
  onCamera,
  onSubmit,
}: {
  lang: Lang;
  permission: { granted: boolean; canAskAgain: boolean } | null;
  cameraBroke: boolean;
  typing: boolean;
  typed: string;
  onTyped: (value: string) => void;
  onAsk: () => void;
  onSettings: () => void;
  onType: () => void;
  onCamera: () => void;
  onSubmit: () => void;
}) {
  const c = useTheme();

  if (typing) {
    return (
      <View>
        <Text style={[text.caps, s.label, { color: c.fgSubtle }]}>
          {scanWord('typeLabel', lang)}
        </Text>

        <TextInput
          value={typed}
          onChangeText={(next) =>
            // Digits only, thirteen of them at most. A barcode is a number
            // printed under the bars, and a field that took letters would
            // collect whatever else is on the box.
            onTyped(next.replace(/\D/g, '').slice(0, 13))
          }
          keyboardType="number-pad"
          autoFocus
          accessibilityLabel={scanWord('typeLabel', lang)}
          placeholder="4780123001927"
          placeholderTextColor={c.fgDisabled}
          style={[
            s.field,
            text.body,
            text.num,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              color: c.fg,
              borderRadius: size.radiusMd,
            },
          ]}
        />

        <Button style={s.action} disabled={typed.length < 8} onPress={onSubmit}>
          {scanWord('look', lang)}
        </Button>

        {/* Only offered when there is a camera to go back to. */}
        {permission?.granted === true && !cameraBroke ? (
          <Button kind="ghost" style={s.action} onPress={onCamera}>
            {scanWord('useCamera', lang)}
          </Button>
        ) : null}
      </View>
    );
  }

  // Still reading the permission off the OS. A card that said "blocked" and
  // then contradicted itself a frame later is worse than a moment of nothing.
  if (permission === null && !cameraBroke) return <View style={s.waiting} />;

  const broken = cameraBroke;
  const askable = permission?.canAskAgain === true;

  return (
    <View
      style={[
        s.card,
        { backgroundColor: c.bgSubtle, borderColor: c.border, borderRadius: size.radiusLg },
      ]}
    >
      <Text style={[text.small, s.strong, { color: c.fg }]}>
        {scanWord(broken ? 'noCameraTitle' : askable ? 'allowTitle' : 'deniedTitle', lang)}
      </Text>
      <Text style={[text.caption, s.body, { color: c.fgMuted }]}>
        {scanWord(broken ? 'noCameraBody' : askable ? 'allowBody' : 'deniedBody', lang)}
      </Text>

      {/*
       * No "allow" button when there is no camera to allow. The OS will not
       * conjure a lens, and a control that cannot work is worse than none.
       */}
      {broken ? null : (
        <Button style={s.action} onPress={askable ? onAsk : onSettings}>
          {scanWord(askable ? 'allow' : 'settings', lang)}
        </Button>
      )}

      {/* Always available, in every one of these states. A refused camera must
          never be the thing that stops a delivery being counted. */}
      <Button kind="secondary" style={s.action} onPress={onType}>
        {scanWord('typeIt', lang)}
      </Button>
    </View>
  );
}

/* ============================================================
   What came back
   ============================================================ */

function Result({
  lookup,
  lang,
  count,
  onCount,
  onKeep,
  onResume,
  onRetry,
}: {
  lookup: Lookup;
  lang: Lang;
  count: string;
  onCount: (value: string) => void;
  onKeep: (item: Ingredient) => void;
  onResume: () => void;
  onRetry: (code: string) => void;
}) {
  const c = useTheme();
  const t = copy(STORE_COPY, lang);

  if (lookup.state === 'idle') return null;

  if (lookup.state === 'looking') {
    return (
      <View style={[s.card, { backgroundColor: c.bgSubtle, borderRadius: size.radiusLg }]}>
        <Text style={[text.caption, text.num, { color: c.fgSubtle }]}>{lookup.code}</Text>
        <Text style={[text.small, s.body, { color: c.fg }]}>{scanWord('looking', lang)}</Text>
      </View>
    );
  }

  if (lookup.state === 'unknown' || lookup.state === 'failed') {
    const problem = lookup.state === 'unknown' ? t.scanUnknown : scanWord(lookup.reason, lang);

    return (
      <View
        style={[
          s.card,
          { backgroundColor: c.danger50, borderColor: c.danger500, borderRadius: size.radiusLg },
        ]}
      >
        <Text style={[text.caption, text.num, { color: c.danger700 }]}>{lookup.code}</Text>
        <Text style={[text.small, s.body, { color: c.danger700 }]}>{problem}</Text>

        {/*
         * A refused permission has no retry — asking the same question louder
         * is what `lib/api.ts` calls the non-retryable case, and it is a
         * manager's job rather than this person's.
         */}
        {lookup.state === 'failed' && lookup.reason === 'offline' ? (
          <Button kind="secondary" style={s.action} onPress={() => onRetry(lookup.code)}>
            {scanWord('retry', lang)}
          </Button>
        ) : null}

        <Button kind="ghost" style={s.action} onPress={onResume}>
          {scanWord('useCamera', lang)}
        </Button>
      </View>
    );
  }

  const { item } = lookup;
  const base = baseUnits(count, item.factor);
  const variance = base === null ? null : base - item.onHand;

  return (
    <View
      style={[
        s.card,
        { backgroundColor: c.surface, borderColor: c.border, borderRadius: size.radiusLg },
      ]}
    >
      <View style={s.head}>
        <Text style={[text.body, s.strong, { color: c.fg, flex: 1 }]} numberOfLines={2}>
          {item.name}
        </Text>
        {item.low && base !== null ? <Chip tone="danger">{scanWord('low', lang)}</Chip> : null}
      </View>

      <Text style={[text.caption, text.num, { color: c.fgSubtle, marginTop: 2 }]}>
        {item.sku} · {lookup.code}
      </Text>

      {/* --------------------------------------------------- the count */}
      <Text style={[text.caps, s.label, { color: c.fgSubtle }]}>
        {scanWord('countLabel', lang)}
      </Text>

      <View style={s.countRow}>
        <TextInput
          value={count}
          onChangeText={(value) =>
            // Digits and one separator, because a keypad offers both a dot and
            // a comma and a storekeeper types 12,5 kilos with whichever is
            // under their thumb. `baseUnits()` accepts either.
            onCount(value.replace(/[^\d.,]/g, '').slice(0, 8))
          }
          keyboardType="decimal-pad"
          accessibilityLabel={scanWord('countLabel', lang)}
          style={[
            s.count,
            text.body,
            text.num,
            {
              backgroundColor: c.bgSubtle,
              borderColor: c.border,
              color: c.fg,
              borderRadius: size.radiusMd,
            },
          ]}
        />

        <Text style={[text.body, { color: c.fgMuted }]}>{item.purchaseUnit}</Text>
      </View>

      {/*
       * The figure that will actually be sent, echoed under the field.
       *
       * Only shown when the two differ — a `pcs` item with a factor of one has
       * nothing to convert, and repeating "4 records 4 pcs" teaches somebody to
       * stop reading the line that matters on the kilo item below it.
       */}
      {base !== null && item.factor > 1 ? (
        <Text style={[text.caption, text.num, s.echo, { color: c.fgSubtle }]}>
          {fillScan(scanWord('asBase', lang), { n: base, unit: item.unit })}
        </Text>
      ) : null}

      {/*
       * The book quantity and the variance, revealed only now. Before a figure
       * is typed this whole block is absent — see the file's docblock: a screen
       * that prints the expected number collects the number it printed.
       */}
      {variance === null ? null : (
        <View style={[s.variance, { borderTopColor: c.divider }]}>
          <Text style={[text.caption, text.num, { color: c.fgSubtle }]}>
            {scanWord('onHand', lang)}: {inPurchaseUnits(item.onHand, item.factor)}{' '}
            {item.purchaseUnit}
          </Text>

          <Text
            style={[
              text.caption,
              text.num,
              s.body,
              {
                color: variance === 0 ? c.success600 : variance < 0 ? c.danger600 : c.warning600,
              },
            ]}
          >
            {variance === 0
              ? scanWord('varianceNone', lang)
              : fillScan(scanWord(variance > 0 ? 'varianceUp' : 'varianceDown', lang), {
                  n: Math.abs(variance),
                  unit: item.unit,
                })}
          </Text>
        </View>
      )}

      <Button style={s.action} disabled={base === null} onPress={() => onKeep(item)}>
        {scanWord('keep', lang)}
      </Button>

      <Button kind="ghost" style={s.action} onPress={onResume}>
        {scanWord('useCamera', lang)}
      </Button>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: size.sp5, paddingBottom: size.sp9 },
  lens: {
    height: 220,
    overflow: 'hidden',
    marginTop: size.sp2,
  },
  frameWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Wide and short: a barcode is a strip, and a square frame invites people to
  // centre a whole box in it and hold it too far away to decode.
  frame: { width: 232, height: 104, borderWidth: 2, opacity: 0.9 },
  waiting: { height: 220, marginTop: size.sp2 },
  card: {
    marginTop: size.sp4,
    padding: size.sp4,
    borderWidth: 1,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  strong: { ...sans(600) },
  body: { marginTop: 6, lineHeight: 18 },
  label: { marginTop: size.sp4, marginBottom: 6 },
  field: {
    height: 48,
    paddingHorizontal: 12,
    letterSpacing: 2,
    borderWidth: 1,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: {
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingHorizontal: 12,
    textAlign: 'right',
    borderWidth: 1,
  },
  echo: { marginTop: 6 },
  variance: { marginTop: size.sp3, paddingTop: size.sp3, borderTopWidth: 1 },
  action: { marginTop: size.sp3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    minHeight: 44,
  },
  main: { flex: 1, minWidth: 0 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rule: { height: 1 },
  /* `[data-press]:active{transform:scale(.97)}` — the design's own
     press. It faded here, which reads as "disabled for a moment". */
  pressed: PRESSED,
});
