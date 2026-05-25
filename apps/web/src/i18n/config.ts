import { getRequestConfig } from 'next-intl/server';
import { messages, type Locale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@campus/i18n';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = SUPPORTED_LOCALES.includes(requested as Locale)
    ? (requested as Locale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: messages[locale],
  };
});
