import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { copy, PROBLEM } from '@restaurant/surfaces/customer/copy';

import { sendFeedback } from './account';
import { Button } from '../ui/primitives';
import { useLocale } from '../lib/locale';
import { useTheme } from '../lib/theme-context';
import { size } from '../theme';
import { text } from '../type';

/**
 * "Muammo bor edi" — the one route out of `GAPS.md §4.1 K3`.
 *
 * Nothing in this product lets a guest say something went wrong: a refund is a
 * manager's approval at the till and a rating lives in the Telegram bot's chat
 * keyboard. The web surface answered that with this sheet; the phone gets the
 * same one, with the same deliberate smallness — a title, an optional line of
 * context, cancel and send. No reason taxonomy, no refund field, no ticket
 * number, because none of those are drawn anywhere and inventing them would be
 * inventing a support product.
 *
 * A real bottom sheet here rather than a full screen: this is an aside from
 * whatever the guest was reading, and the thing it is about — an order, a help
 * row — has to stay visible behind it.
 *
 * ---------------------------------------------------------------------------
 * It reaches somebody now
 *
 * `POST /api/v1/public/feedback` writes a `crm.feedbacks` row the console's CRM
 * screen already lists. Signing in is optional on that endpoint and the token
 * rides along when there is one, so a guest with no account can still report a
 * problem and a signed-in guest's report lands on their record.
 *
 * The score is a 2 rather than a 1: a report from this sheet is a complaint,
 * and `Feedback::negative()` is `score <= 2` — but a 1 is auto-flagged urgent,
 * and a sheet that marked every report urgent would make the flag mean nothing
 * by Friday. The server still raises it on its own if the words say somebody
 * may be hurt.
 *
 * The sheet closes without waiting for the answer. The promise the design makes
 * is "a manager will be in touch", not "the row was written", and a guest who
 * has already closed it cannot act on a network error.
 */
export function ProblemSheet({
  about,
  open,
  onClose,
  onSent,
}: {
  /** What the report is about, carried into the message a manager will read. */
  about: string;
  open: boolean;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const c = useTheme();
  const { lang } = useLocale();
  const insets = useSafeAreaInsets();
  const t = copy(PROBLEM, lang);

  const [note, setNote] = useState('');

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.fill}>
        {/* The scrim is a control, not decoration: tapping outside a sheet is
            how a phone dismisses one, and a scrim that swallows the tap makes
            the sheet feel stuck. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.cancel}
          onPress={onClose}
          style={[s.scrim, { backgroundColor: 'rgba(15,19,32,0.42)' }]}
        />

        <View
          accessibilityViewIsModal
          style={[
            s.sheet,
            {
              backgroundColor: c.surface,
              borderTopLeftRadius: size.radius2xl,
              borderTopRightRadius: size.radius2xl,
              paddingBottom: insets.bottom + size.sp5,
            },
          ]}
        >
          <Text style={[text.title, { color: c.fg }]}>{t.report}</Text>
          <Text style={[text.caption, { color: c.fgSubtle, marginTop: 4 }]}>{about}</Text>

          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={280}
            multiline
            numberOfLines={3}
            placeholder={t.reportPlaceholder}
            placeholderTextColor={c.fgSubtle}
            style={[
              s.input,
              text.body,
              {
                backgroundColor: c.bgSubtle,
                borderColor: c.border,
                color: c.fg,
                borderRadius: size.radiusMd,
              },
            ]}
          />

          <View style={s.actions}>
            <Button kind="secondary" style={s.action} onPress={onClose}>
              {t.cancel}
            </Button>

            <Button
              kind="primary"
              style={s.action}
              onPress={() => {
                // `about` names what went wrong — an order number, a help row —
                // and the note is what the guest wanted to add. Joined, because
                // the console shows one comment column.
                void sendFeedback(lang, {
                  score: 2,
                  aspect: 'problem',
                  comment: note.trim() === '' ? about : `${about} — ${note.trim()}`,
                });

                setNote('');
                onClose();
                onSent(t.sent);
              }}
            >
              {t.send}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { paddingHorizontal: size.sp5, paddingTop: size.sp5 },
  input: {
    minHeight: 92,
    textAlignVertical: 'top',
    paddingHorizontal: size.sp3,
    paddingVertical: size.sp3,
    borderWidth: 1,
    marginTop: size.sp3,
  },
  actions: { flexDirection: 'row', gap: size.sp2, marginTop: size.sp3 },
  action: { flex: 1, minHeight: 48 },
});
