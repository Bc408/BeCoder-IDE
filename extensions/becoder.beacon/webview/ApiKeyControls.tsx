/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { useEffect, useRef, useState } from 'react';
import type { SettingsCommand, SettingsSnapshot } from '../src/modelConfiguration';
import type { ProviderTestSnapshot } from '../src/providerTests';
import { SettingsDialog } from './SettingsDialogs';
import { Icon } from './Icon';
import keyIcon from '@vscode/codicons/src/icons/key.svg';
import eyeIcon from '@vscode/codicons/src/icons/eye.svg';
import eyeClosedIcon from '@vscode/codicons/src/icons/eye-closed.svg';
import deepseekLogo from '../resources/deepseek.svg';

const t = (en: string, cn: string) => document.documentElement.lang.startsWith('zh') ? cn : en;
export type RunSettings = (command: Omit<SettingsCommand, 'requestId' | 'provider' | 'revision'>, revision?: number) => Promise<boolean>;

function KeyVisibilityIcon({ shown }: { shown: boolean }) {
	return <span className="api-key-visibility-icon" aria-hidden="true" style={{ maskImage: `url(${JSON.stringify(shown ? eyeClosedIcon : eyeIcon)})` }} />;
}

export function SavedApiKey({ snapshot, disabled, post, edit, remove }: { snapshot: SettingsSnapshot; disabled: boolean; post(message: unknown): void; edit(): void; remove(): void }) {
	const [revealed, setRevealed] = useState<string>();
	const [error, setError] = useState('');
	const request = useRef<{ id: number; revision: number } | undefined>(undefined);
	const counter = useRef(0);
	const revision = useRef(snapshot.revision); revision.current = snapshot.revision;
	useEffect(() => { request.current = undefined; setRevealed(undefined); setError(''); }, [snapshot.revision]);
	useEffect(() => {
		const listener = (event: MessageEvent) => {
			const value = event.data;
			if (value?.type !== 'connectionKey' || !request.current || value.requestId !== request.current.id || value.revision !== request.current.revision || value.revision !== revision.current) { return; }
			request.current = undefined;
			if (value.error) { setError(value.error); }
			else if (typeof value.key === 'string') { setRevealed(value.key); }
		};
		const hide = () => { if (document.hidden) { request.current = undefined; setRevealed(undefined); } };
		window.addEventListener('message', listener); document.addEventListener('visibilitychange', hide);
		return () => { request.current = undefined; window.removeEventListener('message', listener); document.removeEventListener('visibilitychange', hide); };
	}, []);
	const access = (action: 'copy' | 'reveal') => {
		setError('');
		if (action === 'reveal' && revealed !== undefined) { request.current = undefined; setRevealed(undefined); return; }
		const id = ++counter.current;
		request.current = { id, revision: snapshot.revision };
		post({ type: 'connectionKey', requestId: id, revision: snapshot.revision, action });
	};
	const configured = !!snapshot.keyConfigured.deepseek;
	return <div className="api-key-control"><div className={'connection-key-field' + (configured ? ' configured' : '')}>
		{configured ? <span id="connection-key" className="connection-key-display">{revealed ?? snapshot.keyPreview?.deepseek ?? '••••••••'}</span> : <button type="button" id="connection-key" className="connection-key-display" disabled={disabled} aria-label={t('Add API key', '添加 API 密钥')} onClick={() => { request.current = undefined; setRevealed(undefined); edit(); }}><span className="api-key-mark" aria-hidden="true" style={{ maskImage: `url(${JSON.stringify(keyIcon)})` }} />{t('Add API key', '添加 API 密钥')}</button>}
		{configured && <div className="connection-key-actions">{([{ action: 'copy', icon: 'copy', label: t('Copy key', '复制密钥') }, { action: 'edit', icon: 'edit', label: t('Edit key', '编辑密钥') }, { action: 'delete', icon: 'trash', label: t('Delete key', '删除密钥') }, { action: 'show', label: revealed !== undefined ? t('Hide key', '隐藏密钥') : t('Show key', '显示密钥') }] as const).map(item => <button type="button" key={item.action} className="settings-icon" aria-label={item.label} aria-pressed={item.action === 'show' ? revealed !== undefined : undefined} data-key-action={item.action} data-becoder-tooltip={item.label} disabled={disabled} onClick={() => {
			if (item.action === 'edit' || item.action === 'delete') { request.current = undefined; setRevealed(undefined); if (item.action === 'edit') { edit(); } else { remove(); } }
			else { access(item.action === 'copy' ? 'copy' : 'reveal'); }
		}}>{item.action === 'show' ? <KeyVisibilityIcon shown={revealed !== undefined} /> : <Icon name={item.icon} />}</button>)}</div>}
	</div>{error && <p role="alert" className="settings-warning">{error}</p>}</div>;
}

export function ApiKeyDialog({ replace, revision, pending, error, run, saved, close }: { replace: boolean; revision: number; pending: boolean; error?: string; run: RunSettings; saved(): void; close(): void }) {
	const [key, setKey] = useState('');
	const [shown, setShown] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const [initialRevision] = useState(revision);
	useEffect(() => { input.current?.focus(); }, []);
	return <SettingsDialog title={replace ? t('Replace API key', '更换 API 密钥') : t('Add API key', '添加 API 密钥')} heading={<span className="api-key-heading"><img src={deepseekLogo} alt="" /><span>DeepSeek</span><span>{replace ? t('· Replace API key', '· 更换 API 密钥') : t('· Add API key', '· 添加 API 密钥')}</span></span>} close={close}>
		<form className="api-key-form" onSubmit={async event => { event.preventDefault(); if (await run({ type: 'saveKey', key }, initialRevision)) { setKey(''); setShown(false); saved(); } }}>
			<div className="settings-dialog-body"><div className="api-key-input"><input ref={input} id="api-key-draft" aria-label={t('API key', 'API 密钥')} type={shown ? 'text' : 'password'} value={key} required maxLength={4096} disabled={pending} autoComplete="new-password" spellCheck={false} placeholder={replace ? t('Enter a new API key', '输入新密钥') : t('Enter an API key', '输入 API 密钥')} onChange={event => setKey(event.target.value)} /><button type="button" className="settings-icon" aria-label={shown ? t('Hide input', '隐藏输入') : t('Show input', '显示输入')} aria-pressed={shown} onClick={() => setShown(!shown)}><KeyVisibilityIcon shown={shown} /></button></div>
				<p className="settings-note">{replace ? t('Your saved key stays in use until the new key is saved. Then we test your added models.', '保存后替换旧密钥，并检测已添加模型。') : t('Next, choose models and check their connections.', '下一步选择模型，然后检测连接。')}{t(' Tests may use a small amount of credits.', '检测可能消耗少量额度。')}</p>
				{error && <p className="settings-warning" role="alert">{error}</p>}
			</div><footer><button type="button" disabled={pending} onClick={close}>{t('Cancel', '取消')}</button><button type="submit" className="settings-primary" disabled={pending || !key.trim()}>{pending ? t('Saving…', '保存中…') : replace ? t('Save and test', '保存并检测') : t('Next', '下一步')}</button></footer>
		</form>
	</SettingsDialog>;
}

export function ProviderTestResults({ test }: { test?: ProviderTestSnapshot }) {
	return <div className="provider-test-list" aria-live="polite">{test?.models.map(model => <div className="test-result" key={model.id}><span>{model.id}</span><span className={'provider-test-status ' + model.status}>{model.status === 'success' && <Icon name="check" />}{({ waiting: t('Waiting', '待测试'), running: t('Testing…', '测试中…'), success: t('Connected', '连接成功'), failure: t('Failed', '失败'), cancelled: t('Cancelled', '已取消') })[model.status]}{model.error && <small>{model.error}</small>}</span></div>)}</div>;
}
