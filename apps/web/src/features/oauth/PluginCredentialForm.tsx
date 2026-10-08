import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { oauthApi } from '@/services/api/oauth';
import type { ApiClientRequestScope } from '@/services/api/client';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { PluginCredentialFormDefinition } from './pluginCredentialMetadata';
import styles from './OAuthPage.module.scss';

interface PluginCredentialFormProps {
  pluginId: string;
  definition: PluginCredentialFormDefinition;
  requestScope: ApiClientRequestScope;
  onCreated: () => void;
  loadingMetadata?: boolean;
}

export function PluginCredentialForm({
  pluginId,
  definition,
  requestScope,
  onCreated,
  loadingMetadata = false,
}: PluginCredentialFormProps) {
  const { showNotification } = useNotificationStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || loadingMetadata) return;
    const payload = Object.fromEntries(
      definition.fields.map((field) => [field.name, values[field.name] || ''])
    );
    if (definition.fields.some((field) => field.required && !payload[field.name].trim())) return;
    const isCurrent = () => {
      const auth = useAuthStore.getState();
      return (
        mounted.current &&
        auth.apiBase === requestScope.apiBase &&
        auth.managementKey === requestScope.managementKey
      );
    };
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    try {
      await oauthApi.submitPluginCredential(pluginId, definition.submitPath, payload, requestScope);
      if (!isCurrent()) return;
      setValues((previous) =>
        Object.fromEntries(
          definition.fields.map((field) => [
            field.name,
            field.type === 'password' ? '' : previous[field.name] || '',
          ])
        )
      );
      onCreated();
      showNotification('凭证添加成功', 'success');
    } catch (err: unknown) {
      if (!isCurrent()) return;
      let message = err instanceof Error ? err.message : '添加凭证失败';
      // A plugin error must not accidentally echo submitted secrets back into the panel/toast.
      const secrets = definition.fields
        .filter((field) => field.type === 'password')
        .map((field) => payload[field.name])
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
      for (const secret of secrets) {
        message = message.split(secret).join('[redacted]');
      }
      setError(message);
      showNotification(message, 'error');
    } finally {
      inFlight.current = false;
      if (isCurrent()) setSubmitting(false);
    }
  };

  return (
    <form className={styles.cardContent} onSubmit={submit} autoComplete="off">
      {definition.fields.map((field) => (
        <Input
          key={field.name}
          name={field.name}
          label={field.label}
          placeholder={field.placeholder}
          type={field.type}
          required={field.required}
          autoComplete={field.type === 'password' ? 'new-password' : 'off'}
          value={values[field.name] || ''}
          disabled={submitting || loadingMetadata}
          onChange={(event) =>
            setValues((previous) => ({ ...previous, [field.name]: event.target.value }))
          }
        />
      ))}
      <div className={styles.callbackActions}>
        <Button type="submit" loading={submitting || loadingMetadata}>
          {definition.submitLabel}
        </Button>
      </div>
      {error && (
        <div className="status-badge error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
