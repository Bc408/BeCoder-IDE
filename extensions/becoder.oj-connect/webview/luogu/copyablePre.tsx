/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2018 引领天下. MIT License.
 *  Adapted from yltx/vscode-luogu v4.18.2 (dbced7c2cd0aca345cfa6f91de64b59c02806341).
 *  BeCoder changes: shared OJ data/commands, localization, removed peripheral features.
 *  See ThirdPartyNotices.txt for the original license.
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VSCodeButton } from './uiToolkit';
import { CopyIcon } from './presentation';

class CopyablePreElement extends HTMLPreElement {
  buttonDiv?: HTMLDivElement;
  reactRoot?: import('react-dom/client').Root;
  constructor() {
    super();
  }
  connectedCallback() {
    this.buttonDiv = document.createElement('div');
    this.buttonDiv.className = 'copyButton';
    this.insertBefore(this.buttonDiv, this.firstElementChild);

    const Compose = () => {
      const [animationType, setAnimationType] = useState(false);
      const copy = async () => {
        const text = this.querySelector('code')?.textContent ?? '';
        try { await navigator.clipboard.writeText(text); } catch { return; }
        setAnimationType(true);
      };
      return (
        <VSCodeButton
          appearance={'icon'}
          onClick={copy}
          aria-label={window.__OJ_STATE__.labels.copy}
          title={animationType ? window.__OJ_STATE__.labels.copied : window.__OJ_STATE__.labels.copy}
          onAnimationEnd={() => setAnimationType(false)}
        >
          <span className={animationType ? 'animate' : undefined}><CopyIcon /></span>
        </VSCodeButton>
      );
    };
    (this.reactRoot = createRoot(this.buttonDiv)).render(<Compose />);
  }
  disconnectedCallback() {
    this.reactRoot?.unmount();
    if (this.buttonDiv) { this.removeChild(this.buttonDiv); }
  }
}
customElements.define('copyable-pre', CopyablePreElement, { extends: 'pre' });

export default {};
