/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Competitive Programming Helper contributors and BeCoder contributors.
 *  Licensed under GPL-3.0-or-later. See LICENSE and UPSTREAM.md for provenance.
 *--------------------------------------------------------------------------------------------*/
// BeCoder's CPH shell. Sample cards are adapted from CPH; see UPSTREAM.md.
import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import CaseView from './CaseView';
import { PanelState } from './types';
import './app.css';
import './codicon.css';

declare const acquireVsCodeApi: () => { postMessage(value: unknown): void; getState(): PanelState | undefined; setState(value: PanelState): void };
declare global { interface Window { translations: Record<string, string> } }
const api = acquireVsCodeApi();
const t = (key: string) => window.translations[key] ?? key;

function App() {
	const [state, setState] = useState<PanelState>(api.getState() ?? { revision: '', name: '', source: '', busy: false, message: '', cases: [] });
	const [notice, setNotice] = useState('');
	const [dirty, setDirty] = useState(false);
	const [menu, setMenu] = useState(false);
	const [checkerVisible, setCheckerVisible] = useState(false);
	const [runTarget, setRunTarget] = useState<'all' | 'compile' | number | null>(null);
	const [checkingId, setCheckingId] = useState<number | null>(null);
	const [focusId, setFocusId] = useState<number | null>(null);
	const [requestedRun, setRequestedRun] = useState(false);
	const saving = useRef(false);
	const checkerInputRef = useRef<HTMLInputElement>(null);
	const importInputRef = useRef<HTMLInputElement>(null);
	const updateCheckerPath = (customCheckerPath: string) => {
		api.postMessage({ command: 'dirty' });
		setDirty(true);
		setState(previous => ({ ...previous, customCheckerPath }));
	};
	const openCheckerFile = () => api.postMessage({ command: 'openChecker' });
	useEffect(() => {
		const receive = (event: MessageEvent) => {
			if (event.data?.command === 'requestRun') { setRequestedRun(true); }
			if (event.data?.command === 'progress') {
				const { phase, id } = event.data;
				setRunTarget(phase === 'compile' ? 'compile' : phase === 'running' ? id : null);
				setCheckingId(phase === 'checking' ? id : null);
				setState(previous => ({ ...previous, busy: true, cases: phase === 'running' ? previous.cases.map(item => item.id === id ? { ...item, result: null } : item) : previous.cases }));
			}
			if (event.data?.command === 'result') {
				setState(previous => ({ ...previous, cases: previous.cases.map(item => item.id === event.data.id ? { ...item, result: event.data.result } : item) }));
			}
			if (event.data?.command === 'running') { setRunTarget(event.data.compileOnly ? 'compile' : Number.isSafeInteger(event.data.id) ? event.data.id : 'all'); setState(previous => ({ ...previous, busy: true })); }
			if (event.data?.command === 'state') {
				saving.current = false;
				const next = event.data.state;
				setRunTarget(next.phase === 'compile' ? 'compile' : next.phase === 'running' ? next.activeId : null);
				setCheckingId(next.phase === 'checking' ? next.activeId : null);
				setDirty(false); setState(next); setNotice(''); setFocusId(null);
			}
			if (event.data?.command === 'saved') {
				saving.current = false;
				setState(previous => ({ ...previous, revision: event.data.revision, message: '' }));
			}
			if (event.data?.command === 'failure') {
				saving.current = false;
				setRunTarget(null);
				setCheckingId(null);
				setRequestedRun(false);
				setDirty(false);
				setState(previous => ({ ...previous, busy: false, message: event.data.message, revision: event.data.revision ?? previous.revision }));
			}
		};
		window.addEventListener('message', receive);
		api.postMessage({ command: 'ready' });
		return () => window.removeEventListener('message', receive);
	}, []);
	useEffect(() => { api.setState(state); }, [state]);
	useEffect(() => { setCheckerVisible(!!state.customCheckerPath); }, [state.source]);
	useEffect(() => { if (checkerVisible) { checkerInputRef.current?.focus(); } }, [checkerVisible]);
	useEffect(() => {
		if (!dirty || state.busy || saving.current) { return; }
		const timer = setTimeout(() => {
			saving.current = true;
			setDirty(false);
			api.postMessage({ command: 'save', revision: state.revision, tests: state.cases.map(item => item.testcase), customCheckerPath: state.customCheckerPath ?? '' });
		}, 500);
		return () => clearTimeout(timer);
	}, [dirty, state]);
	const edit = (id: number, input: string, output: string) => setState(previous => {
		if (previous.busy) { return previous; }
		const found = previous.cases.find(item => item.id === id);
		if (!found || (found.testcase.input === input && found.testcase.output === output)) { return previous; }
		api.postMessage({ command: 'dirty' });
		setDirty(true);
		return { ...previous, cases: previous.cases.map(item => item.id === id ? { ...item, testcase: { id, input, output } } : item) };
	});
	const send = (command: 'save' | 'run' | 'compile' | 'delete', id?: number) => {
		if (state.busy || saving.current) { return; }
		setDirty(false);
		setMenu(false);
		setState(previous => ({ ...previous, busy: true }));
		api.postMessage({ command, revision: state.revision, tests: state.cases.map(item => item.testcase), id, customCheckerPath: state.customCheckerPath ?? '' });
	};
	useEffect(() => {
		if (!requestedRun || saving.current || state.busy) { return; }
		setRequestedRun(false);
		if (state.source) { send('run'); }
	}, [requestedRun, state]);
	const stop = () => api.postMessage({ command: 'stop' });
	const importCases = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) { return; }
		try {
			if (file.size > 8 * 1024 * 1024) { throw new Error(t('importTooLarge')); }
			const value = JSON.parse(await file.text());
			if (!Array.isArray(value) || !value.length || value.some(item => !item || typeof item.input !== 'string' || typeof item.output !== 'string')) { throw new Error(t('invalidImport')); }
			if (state.cases.length + value.length > 100) { throw new Error(t('tooManyCases')); }
			const start = Math.max(0, ...state.cases.map(item => item.id)) + 1;
			setState(previous => ({ ...previous, cases: [...previous.cases, ...value.map((item, index) => ({ id: start + index, result: null, testcase: { id: start + index, input: item.input, output: item.output } }))] }));
			api.postMessage({ command: 'dirty' });
			setDirty(true);
			setNotice(t('testcasesImported').replace('{count}', String(value.length)));
		} catch (error) { setNotice(error instanceof Error ? error.message : t('invalidImport')); }
	};
	const passed = state.cases.filter(item => item.result?.pass).length;
	if (!state.source) {
		return <main className='ui p10 fallback'><div className='text-center'>
			<p>{t('empty')}</p><br />
			<button className='btn btn-block' onClick={() => api.postMessage({ command: 'createProblem' })}>
				<span className='icon'><i className='codicon codicon-add' /></span>{' '}{t('createProblem')}
			</button>
			{(state.message || notice) && <div className='request-status' role='status'>{state.message || notice}</div>}
		</div></main>;
	}
	return <main className='ui'>
		<div className='meta'>
			{state.url && !state.local && /^https?:\/\//.test(state.url) ? <a className='problem-name' href={state.url} title={state.source}>{state.name || t('empty')}</a>
				: <span className='problem-name' title={state.source}>{state.name || t('empty')}</span>}
			{runTarget === 'compile' && <span className='compiling' title={t('compiling')}><span className='loader' /></span>}
			{state.source && <span className={`pass-rate ${state.cases.length > 0 && passed === state.cases.length ? 'pass-all' : ''}`}>{passed} / {state.cases.length} {t('passedRate')}</span>}
		</div>
		{(state.message || notice) && <div className='request-status' role='status'>{state.message || notice}</div>}
		{state.source && <>
			<div className='actions'>
				<div className='split-btn'>
					<button className='btn main-btn' aria-label={t('runAll')} disabled={state.busy || !state.cases.length} onClick={() => send('run')}><span className='icon'><i className='codicon codicon-run-above' /></span>{' '}<span className='action-text'>{t('runAll')}</span></button>
					<button className='btn chevron-btn' aria-label={t('moreActions')} aria-expanded={menu} disabled={state.busy} onClick={() => setMenu(value => !value)}><i className='codicon codicon-chevron-down' /></button>
					{menu && <div className='run-menu' role='menu'><button className='btn btn-black' role='menuitem' onClick={() => send('compile')}>{t('compileOnly')}</button></div>}
				</div>
				{state.busy ? <button className='btn btn-orange delete-btn' title={t('stop')} aria-label={t('stop')} onClick={stop}><i className='codicon codicon-circle-slash' /></button>
					: <button className='btn btn-red delete-btn' title={t('delete')} aria-label={t('delete')} onClick={() => send('delete')}><i className='codicon codicon-trash' /></button>}
				<button className='btn btn-yellow settings-btn' title={t('settings')} aria-label={t('settings')} onClick={() => api.postMessage({ command: 'settings' })}><i className='codicon codicon-settings' /></button>
			</div>
			{!state.cases.length && <p>{t('noSamples')}</p>}
			{state.cases.map((item, index) => <CaseView key={`${state.source}:${item.id}`} num={index + 1} case={item}
				updateCase={edit} rerun={id => send('run', id)} remove={id => { setDirty(true); api.postMessage({ command: 'dirty' }); setState(previous => ({ ...previous, cases: previous.cases.filter(value => value.id !== id) })); }}
					notify={setNotice} doFocus={focusId === item.id} customCheckerPath={state.customCheckerPath} hideOutputDifference={state.hideOutputDifference} forceRunning={runTarget === item.id} forceChecking={checkingId === item.id} disabled={state.busy} stop={stop} />)}
			<div className='margin-10'><div className='action-container'><button className='btn btn-green btn-block' aria-label={t('add')} disabled={state.busy || state.cases.length >= 100} onClick={() => setState(previous => {
				api.postMessage({ command: 'dirty' });
				setDirty(true);
				const id = Math.max(0, ...previous.cases.map(item => item.id)) + 1;
				setFocusId(id);
				return { ...previous, cases: [...previous.cases, { id, result: null, testcase: { id, input: '', output: '' } }] };
			})}><span className='icon'><i className='codicon codicon-add' /></span>{' '}{t('add')}</button></div></div>
			<div className='margin-10'>
				<input ref={importInputRef} className='case-import-input' type='file' accept='application/json,.json' onChange={event => { void importCases(event); }} />
				<button className='btn btn-black btn-block' disabled={state.busy || state.cases.length >= 100} title={t('importTooltip')} onClick={() => importInputRef.current?.click()}>
					<i className='codicon codicon-cloud-upload' />{' '}{t('importTestcases')}
				</button>
			</div>
			<div className='margin-10'>
				<button className={`btn btn-block ${state.customCheckerPath?.trim() ? 'btn-orange' : ''}`} onClick={() => setCheckerVisible(value => !value)} aria-expanded={checkerVisible}>
					<span className='icon'><i className={`codicon codicon-chevron-${checkerVisible ? 'up' : 'down'}`} /></span>{' '}{t(state.customCheckerPath?.trim() ? 'customCheckerEnabled' : 'customChecker')}
				</button>
                {checkerVisible && (
                    <div className='pad-10 custom-checker-area'>
                        <div
                            style={{
                                display: 'flex',
                                gap: '5px',
                                alignItems: 'center',
                            }}
                        >
                            <input
                                type='text'
                                disabled={state.busy}
                                className='selectable'
                                placeholder={t('customCheckerPathPlaceholder')}
                                value={state.customCheckerPath || ''}
                                onChange={(e) =>
                                    updateCheckerPath(e.target.value)
                                }
                                ref={checkerInputRef}
                                style={{
                                    flexGrow: 1,
                                    width: '0',
                                    padding: '4px 6px',
                                }}
                            />
                            <button
                                className='btn-chromeless'
                                title={t('openChecker')}
                                onClick={openCheckerFile}
                                disabled={state.busy || saving.current || dirty || !state.customCheckerPath?.trim()}
                            >
                                <span
                                    className='icon'
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <i className='codicon codicon-link-external'></i>
                                </span>
                            </button>
                        </div>
                        <details style={{ marginTop: '10px' }}>
                            <summary
                                style={{
                                    cursor: 'pointer',
                                    fontSize: '0.9em',
                                    opacity: 0.8,
                                }}
                            >
                                {t('usageInstructions')}
                            </summary>
                            <div style={{ marginTop: '10px' }}>
                                <small>
                                    {t('customCheckerDescription')}
                                    <br />
                                    <br />
                                    {t('exitCodes')}
                                    <br />
                                    <br />
                                    {t('invocationFormat')}:
                                    <br />
                                    <code>
                                        {state.pythonCommand ?? 'python'}{' '}
                                        &lt;script-path&gt; &lt;input-file&gt;
                                        &lt;output-file&gt;
                                    </code>
                                    <ul
                                        style={{
                                            margin: '10px 0',
                                            paddingLeft: '20px',
                                        }}
                                    >
                                        <li>
                                            <b>&lt;script-path&gt;</b>:{' '}
                                            {t('argScriptPath')}
                                        </li>
                                        <li>
                                            <b>&lt;input-file&gt;</b>:{' '}
                                            {t('argInputFile')}
                                        </li>
                                        <li>
                                            <b>&lt;output-file&gt;</b>:{' '}
                                            {t('argOutputFile')}
                                        </li>
                                    </ul>
                                    {t('expectedBehavior')}
                                    <br />
                                    <textarea
                                        className='selectable'
                                        readOnly
                                        value={`with open(sys.argv[1], "r") as f:
    test_input = f.read()
with open(sys.argv[2], "r") as f:
    code_output = f.read()`}
                                        style={{
                                            fontSize: '0.9em',
                                            height: '95px',
                                            width: '100%',
                                            display: 'block',
                                        }}
                                    />
                                    <br />
                                    <a
                                        href='https://github.com/agrawal-d/cph/blob/main/docs/user-guide.md#custom-checker'
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='btn btn-black'
                                        style={{
                                            fontSize: '0.9em',
                                            display: 'inline-block',
                                        }}
                                    >
                                        <i className='codicon codicon-book'></i>{' '}
                                        {t('documentation')}
                                    </a>
                                </small>
                            </div>
                        </details>
                    </div>
                )}
			</div>
		</>}
	</main>;
}

createRoot(document.getElementById('app')!).render(<App />);
