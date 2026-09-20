/*---------------------------------------------------------------------------------------------
 *  Derived from Competitive Programming Helper.
 *  Copyright (c) Competitive Programming Helper contributors and BeCoder contributors.
 *  Licensed under GPL-3.0-or-later. See LICENSE and UPSTREAM.md.
 *--------------------------------------------------------------------------------------------*/
// Derived from Competitive Programming Helper (GPL-3.0-or-later); see UPSTREAM.md.
import React from 'react';
import { DiffResult, TokenDiff } from '../src/diffOutput';
const t = (key: string) => window.translations[key] ?? key;
export default function DiffView({
    diff,
    copyToClipboard,
}: {
    diff: DiffResult;
    copyToClipboard: (text: string) => void;
}) {
    if (diff.isMatch) {
        return null;
    }

    // Plain text version for clipboard (actual received output)
    const plainText = diff.tokenDiff
        .filter((t) => t.status !== 'missing')
        .map((t) => t.token)
        .join('');

    return (
        <div className="textarea-container">
            {t('outputDifference')}
            <div style={{ display: 'inline-flex', gap: '6px', float: 'right' }}>
                <div
                    className="clipboard"
                    onClick={() => copyToClipboard(plainText)}
                    title={t('copiedToClipboard')}
                >
                    {t('copy')}
                </div>
            </div>
            <div style={{ clear: 'both' }} />
            <div
                className="selectable received-textarea"
                style={{
                    padding: '6px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                }}
            >
                {diff.tokenDiff.map((t, idx) => (
                    <TokenChip key={idx} token={t} />
                ))}
            </div>
        </div>
    );
}

function TokenChip({ token }: { token: TokenDiff }) {
    if (token.token === '\n') {
        return <br />;
    }

    if (token.status === 'match') {
        return <span>{token.token}</span>;
    }

    if (token.status === 'extra') {
        return (
            <span
                style={{
                    backgroundColor:
                        'var(--vscode-diffEditor-insertedTextBackground)',
                    borderRadius: '3px',
                    padding: '1px 3px',
                }}
            >
                {token.token}
            </span>
        );
    }

    // missing — in expected but not received
    return (
        <span
            style={{
                backgroundColor:
                    'var(--vscode-diffEditor-removedTextBackground)',
                textDecoration: 'line-through',
                borderRadius: '3px',
                padding: '1px 3px',
            }}
        >
            {token.token}
        </span>
    );
}
