/* Copyright (c) BeCoder contributors. Licensed under MIT. */
import { providers, type ProviderId } from '../src/connection';
import deepseekLogo from '../resources/deepseek.svg';
import bailianLogo from '../resources/bailian-color.svg';
import moonshotLogo from '../resources/moonshot.svg';
import ollamaLogo from '../resources/ollama.svg';

const logos: Record<ProviderId, string> = { deepseek: deepseekLogo, bailian: bailianLogo, moonshot: moonshotLogo, ollama: ollamaLogo };

export function providerName(provider: ProviderId): string {
	return provider === 'bailian' ? document.documentElement.lang.startsWith('zh') ? '百炼' : 'Bailian' : providers[provider].name;
}
export function ProviderMark({ provider }: { provider: ProviderId }) {
	return <img className={'provider-mark' + (provider === 'moonshot' || provider === 'ollama' ? ' provider-mark-mono' : '')} src={logos[provider]} alt="" />;
}
