import { getTranslations } from 'next-intl/server';

import { ResetForm } from './reset-form';

export async function generateMetadata() {
  const t = await getTranslations('marketing.reset');
  return { title: t('title') };
}

/** A server shell for the title; the form itself holds state. */
export default function ForgotPasswordPage() {
  return <ResetForm />;
}
