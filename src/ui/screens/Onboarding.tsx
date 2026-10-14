import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { formatId, loadOrCreateIdentity } from '../../core/identity.js';
import type { Paths } from '../../core/paths.js';
import { AppStore } from '../../core/store.js';
import { LOGO_SMALL } from '../components/Banner.js';
import { InputBox } from '../components/InputBox.js';
import { emptyEditor, type EditorState } from '../editor.js';
import { theme } from '../theme.js';

/** First launch: pick a name, generate keys, show your ID. */
export function Onboarding({ paths, width, onDone }: { paths: Paths; width: number; onDone(): void }) {
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [created, setCreated] = useState<{ name: string; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((_i, key) => key.return && onDone(), { isActive: created !== null });

  const submit = (value: string) => {
    const name = value.trim();
    if (!name) {
      setError('Please enter a name.');
      return;
    }
    try {
      AppStore.createProfile(paths, name);
      setCreated({ name, id: loadOrCreateIdentity(paths).id });
    } catch (err) {
      setError(`Could not create profile: ${(err as Error).message}`);
    }
  };

  const boxWidth = Math.min(64, width - 4);
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {LOGO_SMALL.map((l, i) => (
        <Text key={i} color={theme.accent}>
          {l}
        </Text>
      ))}
      <Text color={theme.dim}>encrypted file sharing with friends on your network</Text>
      <Text> </Text>
      {created ? (
        <>
          <Text>
            Welcome, <Text bold>{created.name}</Text>!
          </Text>
          <Text> </Text>
          <Text color={theme.dim}>Your personal ID has been created:</Text>
          <Text color={theme.accent} bold>
            {'  '}
            {formatId(created.id, true)}
          </Text>
          <Text> </Text>
          <Text color={theme.dim}>It's tied to a secret key on this device. That's how your friends recognize</Text>
          <Text color={theme.dim}>you – even if your name or IP address changes.</Text>
          <Text color={theme.dim}>Every connection is end-to-end encrypted.</Text>
          <Text> </Text>
          <Text>
            Press <Text color={theme.accent}>enter</Text> to continue
          </Text>
        </>
      ) : (
        <>
          <Text bold>What should your friends see you as?</Text>
          <Text color={theme.dim}>You can change it later with /name.</Text>
          <Text> </Text>
          <InputBox
            state={editor}
            onChange={(s) => {
              setEditor(s);
              setError(null);
            }}
            onSubmit={submit}
            isActive
            singleLine
            width={boxWidth}
            placeholder="Your name"
            borderColor={theme.accent}
          />
          {error ? <Text color={theme.error}>{error}</Text> : null}
        </>
      )}
    </Box>
  );
}
