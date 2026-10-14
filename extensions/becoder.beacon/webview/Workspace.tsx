/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import type { IBeaconContext } from '../../../src/vs/platform/beacon/common/beaconContextTypes';
import { Icon } from './Icon';

const zh = document.documentElement.lang.startsWith('zh');
export function Workspace({ context, busy, post }: { context?: IBeaconContext; busy: boolean; post(message: unknown): void }) {
	const disabled = busy || !!context?.busy || !context;
	return <section className="beacon-workspace" aria-label={zh ? 'Beacon 工作区' : 'Beacon workspace'}>
		<div><Icon name="folder" /><strong>{zh ? 'Beacon 工作区' : 'Beacon workspace'}</strong><button type="button" disabled={disabled} onClick={() => post({ type: 'chooseWorkspace' })}>{zh ? '选择文件夹' : 'Choose folder'}</button></div>
		<p title={context?.root}>{context?.root || (zh ? '尚未选择 · 临时对话不保存' : 'Not selected · temporary chats are not saved')}</p>
		{context?.root && !context.usable && <p role="status">{zh ? '所选工作区不可用，已保留选择。恢复后重试，或重新选择文件夹。' : 'The selected workspace is unavailable. Restore it or select a folder again.'}</p>}
		{!!context?.recent.length && <select aria-label={zh ? '最近的 Beacon 工作区' : 'Recent Beacon workspaces'} value="" disabled={disabled} onChange={event => { if (event.target.value) { post({ type: 'selectWorkspace', root: event.target.value }); } }}><option value="">{zh ? '最近的工作区…' : 'Recent workspaces…'}</option>{context.recent.map(root => <option key={root} value={root}>{root}</option>)}</select>}
	</section>;
}
