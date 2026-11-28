/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useState } from 'react';
import type { SettingsSnapshot } from '../src/modelConfiguration';
import { resolveCapabilities } from '../src/models';
import { providerName } from './ProviderIdentity';
import type { ProviderId } from '../src/connection';

const zh = document.documentElement.lang.startsWith('zh');
const t = (en: string, cn: string) => zh ? cn : en;
export function TranslationSettings({ snapshot, post }: { snapshot: SettingsSnapshot; post(message: unknown): void }) {
	const [pending, setPending] = useState(false), [error, setError] = useState('');
	useEffect(() => {
		const listener = (event: MessageEvent) => { if (event.data?.type === 'settingsResult' && event.data.requestId < 0) { setPending(false); setError(event.data.ok ? '' : event.data.error ?? t('Could not save the selection.', '未能保存选择。')); } };
		window.addEventListener('message', listener); return () => window.removeEventListener('message', listener);
	}, []);
	const selected = snapshot.translationSelection;
	const choices = Object.entries(snapshot.providers).flatMap(([id, profile]) => profile.models.filter(model => ['chat', 'unknown'].includes(resolveCapabilities(id as ProviderId, profile.baseURL, model.id, model.discovered, model.settings).purpose)).map(model => ({ provider: id as ProviderId, id: model.id, name: providerName(id as ProviderId) + ' · ' + model.name })));
	const selectedValue = selected ? JSON.stringify(selected) : '';
	return <>
		<header className="settings-header"><h1>{t('Problem translation', '题面翻译')}</h1></header>
		<section className="settings-card"><div className="settings-row"><div className="settings-row-copy"><label className="settings-row-title" htmlFor="translation-model">{t('Translation model', '翻译模型')}</label><small>{t('Choose independently; uses the saved provider connection and API key.', '独立选择，复用已保存的服务商连接与密钥。')}</small></div>
		<div className="settings-row-control"><select id="translation-model" value={selectedValue} disabled={pending || snapshot.pending} onChange={event => {
			const selection = JSON.parse(event.target.value); setPending(true); setError('');
			post({ type: 'selectTranslationModel', provider: selection.provider, id: selection.model, revision: snapshot.revision, requestId: -Date.now() });
		}}><option value="" disabled>{t('Choose a model', '选择模型')}</option>{selected && !choices.some(choice => choice.provider === selected.provider && choice.id === selected.model) && <option value={selectedValue} disabled>{t('Selected model unavailable', '所选模型不可用')}</option>}{choices.map(choice => <option key={choice.provider + ':' + choice.id} value={JSON.stringify({ provider: choice.provider, model: choice.id })}>{choice.name}</option>)}</select></div></div></section>
		<p className="settings-note">{t('Translation uses a dedicated prompt without chat history. Select a missing language on the problem page to translate.', '翻译使用专用提示词，不携带聊天历史。在题面页选择缺失的语种即可翻译。')}</p>
		{!choices.length && <p className="settings-note">{t('Add a text model under Model configuration first.', '请先在“模型配置”中添加文本模型。')}</p>}
		{(error || snapshot.translationError) && <p role="alert" className="settings-feedback failure">{error || snapshot.translationError}</p>}
	</>;
}
