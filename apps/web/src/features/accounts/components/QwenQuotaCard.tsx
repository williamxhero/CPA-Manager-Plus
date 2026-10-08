import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import type { QwenQuotaState } from '@/utils/quota/qwenQuota';
import { QuotaProgressBar } from './QuotaProgressBar';
import styles from './QwenQuotaCard.module.scss';

interface QwenQuotaCardProps {
  quota?: QwenQuotaState;
  refreshing: boolean;
  disabled: boolean;
  onRefresh: () => void;
}

export function QwenQuotaCard({ quota, refreshing, disabled, onRefresh }: QwenQuotaCardProps) {
  const { t, i18n } = useTranslation();
  const formatDate = (value: number | null) =>
    value === null ? '-' : new Date(value).toLocaleString(i18n.language);
  const data = quota?.status === 'success' ? quota : undefined;

  return (
    <div
      className={styles.card}
      data-qwen-quota-card="true"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className={styles.header}>
        <strong>{t('qwen_quota.plan')}</strong>
        <Button
          variant="secondary"
          size="sm"
          loading={refreshing}
          disabled={disabled || refreshing}
          onClick={onRefresh}
        >
          {!refreshing ? <IconRefreshCw size={14} /> : null}
          {t('qwen_quota.refresh')}
        </Button>
      </div>
      {quota?.status === 'error' ? (
        <p role="alert">{quota.error}</p>
      ) : data ? (
        <>
          <div className={styles.chips}>
            {data.plan ? <span className={styles.chip}>{data.plan}</span> : null}
            {data.planStatus ? <span className={styles.chip}>{data.planStatus}</span> : null}
            {data.planEndMs !== null ? (
              <span>
                {t('qwen_quota.expires_at')}: {formatDate(data.planEndMs)}
              </span>
            ) : null}
            {data.daysLeft !== null ? (
              <span>{t('qwen_quota.days_left', { days: data.daysLeft })}</span>
            ) : null}
          </div>
          {data.windows.length > 0 ? <strong>{t('qwen_quota.quota')}</strong> : null}
          {data.windows.map((window) => (
            <div key={window.id} className={styles.window} data-qwen-quota-window={window.id}>
              <div className={styles.header}>
                <span>{window.label}</span>
                <span>{t('qwen_quota.remaining', { percent: window.remainingPercent })}</span>
              </div>
              <div
                role="meter"
                aria-label={window.label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={window.remainingPercent}
                title={t('qwen_quota.used', { percent: window.usedPercent })}
              >
                <QuotaProgressBar
                  percent={window.remainingPercent}
                  highThreshold={70}
                  mediumThreshold={30}
                />
              </div>
              <div className={styles.meta}>
                <span>{t('qwen_quota.used', { percent: window.usedPercent })}</span>
                {window.resetAtMs !== null ? (
                  <span>
                    {t('qwen_quota.reset_at')}: {formatDate(window.resetAtMs)}
                  </span>
                ) : null}
                {window.resetsInDays !== null ? (
                  <span>{t('qwen_quota.resets_in_days', { days: window.resetsInDays })}</span>
                ) : null}
              </div>
            </div>
          ))}
          <div className={styles.chips}>
            {data.metrics.map((metric) => (
              <span className={styles.chip} key={metric.key}>
                {metric.label}:{' '}
                {metric.value.toLocaleString(i18n.language)}
                {metric.unit ? ` ${metric.unit}` : ''}
              </span>
            ))}
          </div>
          {data.observedAtMs !== null ? (
            <span className={styles.meta}>
              {t('qwen_quota.observed_at')}: {formatDate(data.observedAtMs)}
            </span>
          ) : null}
        </>
      ) : (
        <span className={styles.meta}>
          {t(quota?.status === 'loading' ? 'common.loading' : 'accounts.quota_source_none')}
        </span>
      )}
    </div>
  );
}
