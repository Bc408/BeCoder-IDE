/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Competitive Programming Helper contributors and BeCoder contributors.
 *  Licensed under GPL-3.0-or-later. See LICENSE and UPSTREAM.md for provenance.
 *--------------------------------------------------------------------------------------------*/
// Derived from CPH (GPL-3.0-or-later), see UPSTREAM.md. Host owns message listeners.
import { Case } from './types';
import React, { useState, useRef, useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import DiffView from './DiffView';

interface CustomWindow extends Window {
    translations: Record<string, string>;
}
declare const window: CustomWindow;

const t = (key: string): string => {
    return window.translations[key] || key;
};

export default function CaseView(props: {
    num: number;
    case: Case;
    rerun: (id: number, input: string, output: string) => void;
    updateCase: (id: number, input: string, output: string) => void;
    remove: (num: number) => void;
    notify: (text: string) => void;
    doFocus?: boolean;
    forceRunning: boolean;
    forceChecking: boolean;
    customCheckerPath?: string;
    hideOutputDifference?: boolean;
    disabled: boolean;
    stop: () => void;
}) {
    const { id, result } = props.case;

    const [input, setInput] = useState<string>(props.case.testcase.input);
    const [output, setOutput] = useState<string>(props.case.testcase.output);
    const [running, setRunning] = useState<boolean>(false);
    const [checking, setChecking] = useState<boolean>(false);
    const [minimized, setMinimized] = useState<boolean>(
        props.case.result?.pass === true && !props.case.result.stderr,
    );
    const inputBox = useRef<HTMLTextAreaElement>(null);
	useEffect(() => { setInput(props.case.testcase.input); setOutput(props.case.testcase.output); }, [props.case.testcase.input, props.case.testcase.output]);

    useEffect(() => {
        if (props.doFocus) {
            inputBox.current?.scrollIntoView?.({ behavior: 'smooth' });
        }
    }, [props.doFocus]);

    useEffect(() => {
        props.updateCase(props.case.id, input, output);
    }, [input, output]);

    useEffect(() => {
        if (props.forceRunning) {
            setRunning(true);
            setChecking(false);
        } else {
            setRunning(false);
        }
    }, [props.forceRunning]);

    useEffect(() => {
        if (props.forceChecking) {
            setRunning(false);
            setChecking(true);
        } else {
            setChecking(false);
        }
    }, [props.forceChecking]);

    const handleInputChange = (
        event: React.ChangeEvent<HTMLTextAreaElement>,
    ) => {
        setInput(event.target.value);
    };

    const handleOutputChange = (
        event: React.ChangeEvent<HTMLTextAreaElement>,
    ) => {
        setOutput(event.target.value);
    };

    const rerun = () => {
        props.rerun(id, input, output);
    };

    const expand = () => {
        setMinimized(false);
    };

    const minimize = () => {
        setMinimized(true);
    };

    const toggle = () => (minimized ? expand() : minimize());

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            props.notify(t('copiedToClipboard'));
        } catch {
            props.notify(t('copyFailed'));
        }
    };

    useEffect(() => {
        if (props.case.result !== null) {
            setRunning(false);
            setChecking(false);
            setMinimized(props.case.result.pass && !props.case.result.stderr);
        }
    }, [props.case.result]);

    useEffect(() => {
        if (running || checking) {
            setMinimized(true);
        }
    }, [running, checking]);



    let resultText = '';
    const stderror = result?.stderr;
    // Handle several cases for result text
    if (result?.signal) {
        resultText = result?.signal;
    } else if (result?.stdout) {
        const rawStdout = result.stdout || ' ';
        if (rawStdout.endsWith('\r\n')) {
            resultText = rawStdout.slice(0, -2);
        } else if (rawStdout.endsWith('\n')) {
            resultText = rawStdout.slice(0, -1);
        } else {
            resultText = rawStdout;
        }
        if (resultText === '') {
            resultText = ' ';
        }
    }
    if (!result) {
        resultText = t('runToShowOutput');
    }
    if (running || checking) {
        resultText = '...';
    }
    const caseClassName =
        'case ' + (running || checking ? 'running' : result?.pass ? 'passed' : result ? 'failed' : '');
    const timeText = result?.timeOut ? t('timedOut') : (result?.time ?? 0) + 'ms';

    return (
        <div className={caseClassName}>
            <div className='case-metadata'>
                <div className='toggle-minimize' onClick={toggle}>
                    <span className='case-number case-title'>
                        {minimized && (
                            <span onClick={expand} title={t('expand')}>
                                <span className='icon'>
                                    <i className='codicon codicon-chevron-down'></i>
                                </span>
                            </span>
                        )}
                        {!minimized && (
                            <span onClick={minimize} title={t('minimize')}>
                                <span className='icon'>
                                    <i className='codicon codicon-chevron-up'></i>
                                </span>
                            </span>
                        )}
                        &nbsp;TC {props.num}
                    </span>
                    {(running || checking) && (
                        <span className='running-text'>
                            {running ? t('running') : t('checking')}
                        </span>
                    )}
                    {result && !running && !checking && (
                        <>
                            <span className='result-data'>
                                <span
                                    className={
                                        result.pass
                                            ? 'result-pass'
                                            : 'result-fail'
                                    }
                                >
                                    &nbsp; &nbsp;
                                    {t(result.verdict)}
                                </span>
                            </span>
                            <span className='exec-time'>{timeText}</span>
                        </>
                    )}
                </div>
                <div className='time'>
                    {running || checking ? (
                        <button
                            disabled={props.disabled && !running && !checking}
                            className='btn btn-orange'
                            title={t('stop')}
                            onClick={props.stop}
                        >
                            <span className='icon'>
                                <i className='codicon codicon-circle-slash'></i>
                            </span>{' '}
                        </button>
                    ) : (
                        <button
                            disabled={props.disabled && !running && !checking}
                            className='btn btn-green'
                            title={t('runAgain')}
                            onClick={rerun}
                        >
                            <span className='icon'>
                                <i className='codicon codicon-play'></i>
                            </span>{' '}
                        </button>
                    )}
                    <button
                        disabled={props.disabled && !running && !checking}
                            className='btn btn-red'
                        title={t('deleteTestcase')}
                        onClick={() => {
                            props.remove(id);
                        }}
                    >
                        <span className='icon'>
                            <i className='codicon codicon-trash'></i>
                        </span>{' '}
                    </button>
                </div>
            </div>
            {!minimized && (
                <>
                    <div className='textarea-container'>
                        {t('inputLabel')}
                        <div
                            className='clipboard'
                            onClick={() => {
                                copyToClipboard(input);
                            }}
                            title={t('copiedToClipboard')}
                        >
                            {t('copy')}
                        </div>
                        <TextareaAutosize
                            className='selectable input-textarea'
                            disabled={props.disabled}
                            onChange={handleInputChange}
                            value={input}
                            maxRows={Math.max(1, input.replace(/\r?\n$/, '').split('\n').length)}
                            ref={inputBox}
                            autoFocus={props.doFocus}
                        />
                    </div>
                    <div
                        className={`textarea-container expected-output-container ${props.customCheckerPath?.trim() ? 'hidden' : ''}`}
                    >
                        {t('expectedOutputLabel')}
                        <div
                            className='clipboard'
                            onClick={() => {
                                copyToClipboard(output);
                            }}
                            title={t('copiedToClipboard')}
                        >
                            {t('copy')}
                        </div>
                        <TextareaAutosize
                            className='selectable expected-textarea'
                            disabled={props.disabled}
                            onChange={handleOutputChange}
                            value={output}
                            maxRows={Math.max(1, output.replace(/\r?\n$/, '').split('\n').length)}
                        />
                    </div>
                    {props.case.result !== null && (
                        <div className='textarea-container'>
                            {t('receivedOutputLabel')}
                            <div
                                className='clipboard'
                                onClick={() => {
                                    copyToClipboard(resultText);
                                }}
                                title={t('copiedToClipboard')}
                            >
                                {t('copy')}
                            </div>
                            <div
                                className='expectedoutput'
                                onClick={() => {
                                    if (props.disabled) { return; }
                                    setOutput(resultText);
                                    props.notify(t('setAsExpectedOutput'));
                                }}
                                title={t('setAsExpectedOutput')}
                            >
                                {t('set')}
                            </div>
                            <>
                                <TextareaAutosize
                                    className='selectable received-textarea'
                                    value={trunctateStdout(resultText)}
                                    readOnly
                                />
                            </>
                        </div>
                    )}
                    {stderror && stderror.length > 0 && (
                        <div className='textarea-container'>
                            {t('standardError')}
                            <TextareaAutosize
                                className='selectable stderror-textarea'
                                value={trunctateStdout(stderror)}
                                readOnly
                            />
                        </div>
                    )}
                    {result && !result.pass && result.diff && !props.hideOutputDifference && !props.customCheckerPath?.trim() && <DiffView diff={result.diff} copyToClipboard={copyToClipboard} />}
                    {props.case.result?.checkerRun && !running && !checking && (
                        <details style={{ marginTop: '10px' }}>
                            <summary
                                style={{
                                    cursor: 'pointer',
                                    fontSize: '0.9em',
                                    opacity: 0.8,
                                }}
                            >
                                {t('checkerLog')}
                            </summary>
                            <div style={{ marginTop: '5px' }}>
                                <small
                                    style={{
                                        display: 'block',
                                        marginTop: '5px',
                                    }}
                                >
                                    {t('checkerExitCode')}{' '}
                                    <code>
                                        {props.case.result.checkerRun.exitCode !==
                                        null
                                            ? props.case.result.checkerRun.exitCode
                                            : props.case.result.checkerRun
                                                  .signal || 'Terminated'}
                                    </code>
                                </small>
                                <small
                                    style={{
                                        display: 'block',
                                        marginTop: '10px',
                                    }}
                                >
                                    {t('checkerOutput')}
                                </small>
                                <textarea
                                    className='selectable'
                                    readOnly
                                    value={trunctateStdout(
                                        `STDOUT:\n${props.case.result.checkerRun.stdout}\n\nSTDERR:\n${props.case.result.checkerRun.stderr}`,
                                    )}
                                    style={{
                                        fontSize: '0.9em',
                                        height: '100px',
                                        width: '100%',
                                        display: 'block',
                                        marginTop: '5px',
                                    }}
                                />
                                <small
                                    style={{
                                        display: 'block',
                                        marginTop: '10px',
                                    }}
                                >
                                    {t('checkerInvocation')}
                                </small>
                                <textarea
                                    className='selectable'
                                    readOnly
                                    value={props.case.result.checkerRun.command}
                                    style={{
                                        fontSize: '0.9em',
                                        height: '40px',
                                        width: '100%',
                                        display: 'block',
                                        marginTop: '5px',
                                    }}
                                />
                                <small
                                    style={{
                                        display: 'block',
                                        marginTop: '10px',
                                    }}
                                >
                                    {t('checkerDuration')}{' '}
                                    {props.case.result.checkerRun.exitCode === null
                                        ? 'Terminated'
                                        : `${props.case.result.checkerRun.durationMs}ms`}
                                </small>
                            </div>
                        </details>
                    )}
                </>
            )}
        </div>
    );
}

const trunctateStdout = (stdout: string): string => {
    if (stdout.length > 100000) {
        stdout = '[Truncated]\n' + stdout.substr(0, 100000);
    }
    return stdout;
};
