// @ts-nocheck
import React from 'react'
import { Btn, Badge } from '@/caliper/ui'
import { SettingsFieldRow } from './SettingsFieldRow'

export function ApiProviderSection({
  settings,
  defaultModel,
  onDefaultModelChange,
  anthropicKey,
  onAnthropicKeyChange,
  openaiKey,
  onOpenaiKeyChange,
  supportedModels,
  saving,
  onSaveModel,
  onSaveAnthropicKey,
  onSaveOpenaiKey,
}) {
  return (
    <>
      <SettingsFieldRow label="Default model" hint="Used when a job does not specify its own model.">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <select
            className="sel"
            value={defaultModel}
            onChange={(e) => onDefaultModelChange(e.target.value)}
            style={{ minWidth: 200 }}
          >
            {supportedModels.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <Btn variant="primary" disabled={saving} onClick={onSaveModel}>Save</Btn>
        </div>
      </SettingsFieldRow>

      <div className="settings-provider-card">
        <div className="settings-provider-card__head">
          <span className="settings-provider-card__title">Anthropic</span>
          <Badge tone={settings?.has_anthropic_key ? 'ok' : 'ghost'} dot={settings?.has_anthropic_key}>
            {settings?.has_anthropic_key ? 'Connected' : 'Not configured'}
          </Badge>
        </div>
        <p className="settings-provider-card__hint">
          {settings?.has_anthropic_key
            ? 'Key stored · enter a new key to replace it.'
            : 'No key stored. Claude models require an Anthropic API key.'}
        </p>
        <div className="settings-provider-card__row">
          <input
            className="inp inp--mono"
            type="password"
            placeholder={settings?.has_anthropic_key ? '••••••••••••••••••••••••••' : 'sk-ant-…'}
            value={anthropicKey}
            onChange={(e) => onAnthropicKeyChange(e.target.value)}
            autoComplete="off"
            aria-label="Anthropic API key"
          />
          <Btn
            variant="ghost"
            disabled={saving || !anthropicKey.trim()}
            onClick={onSaveAnthropicKey}
          >
            Save key
          </Btn>
        </div>
      </div>

      <div className="settings-provider-card">
        <div className="settings-provider-card__head">
          <span className="settings-provider-card__title">OpenAI</span>
          <Badge tone={settings?.has_openai_key ? 'ok' : 'ghost'} dot={settings?.has_openai_key}>
            {settings?.has_openai_key ? 'Connected' : 'Not configured'}
          </Badge>
        </div>
        <p className="settings-provider-card__hint">
          {settings?.has_openai_key
            ? 'Key stored · enter a new key to replace it.'
            : 'No key stored. GPT models require an OpenAI API key.'}
        </p>
        <div className="settings-provider-card__row">
          <input
            className="inp inp--mono"
            type="password"
            placeholder={settings?.has_openai_key ? '••••••••••••••••••••••••••' : 'sk-…'}
            value={openaiKey}
            onChange={(e) => onOpenaiKeyChange(e.target.value)}
            autoComplete="off"
            aria-label="OpenAI API key"
          />
          <Btn
            variant="ghost"
            disabled={saving || !openaiKey.trim()}
            onClick={onSaveOpenaiKey}
          >
            Save key
          </Btn>
        </div>
      </div>
    </>
  )
}
