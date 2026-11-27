/*---------------------------------------------------------------------------------------------
 *  Copyright (c) BeCoder contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in this directory's extension root.
 *--------------------------------------------------------------------------------------------*/

export function responsesStream(text = 'answer', call?: { id: string; name: string; input: string }, reasoning: boolean | 'encrypted-only' = false): Response {
	const events: Record<string, unknown>[] = [{ type: 'response.created', response: { id: 'resp_fixture', created_at: 1, model: 'fixture' } }];
	if (reasoning) {
		events.push({ type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_fixture', encrypted_content: null } });
		if (reasoning === true) {
			events.push(
				{ type: 'response.reasoning_summary_part.added', item_id: 'rs_fixture', output_index: 0, summary_index: 0, part: { type: 'summary_text', text: '' } },
				{ type: 'response.reasoning_summary_text.delta', item_id: 'rs_fixture', output_index: 0, summary_index: 0, delta: 'inspect the evidence' },
				{ type: 'response.reasoning_summary_part.done', item_id: 'rs_fixture', output_index: 0, summary_index: 0, part: { type: 'summary_text', text: 'inspect the evidence' } }
			);
		}
		events.push({ type: 'response.output_item.done', output_index: 0, item: { type: 'reasoning', id: 'rs_fixture', summary: reasoning === true ? [{ type: 'summary_text', text: 'inspect the evidence' }] : [], encrypted_content: 'encrypted-fixture' } });
	}
	const outputIndex = reasoning ? 1 : 0;
	if (call) {
		const item = { type: 'function_call', id: 'fc_' + call.id, call_id: call.id, name: call.name, arguments: '' };
		events.push(
			{ type: 'response.output_item.added', output_index: outputIndex, item },
			{ type: 'response.function_call_arguments.delta', item_id: item.id, output_index: outputIndex, delta: call.input },
			{ type: 'response.function_call_arguments.done', item_id: item.id, output_index: outputIndex, arguments: call.input },
			{ type: 'response.output_item.done', output_index: outputIndex, item: { ...item, arguments: call.input, status: 'completed' } }
		);
	} else {
		events.push(
			{ type: 'response.output_item.added', output_index: outputIndex, item: { type: 'message', id: 'msg_fixture', role: 'assistant', content: [] } },
			{ type: 'response.content_part.added', item_id: 'msg_fixture', output_index: outputIndex, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
			{ type: 'response.output_text.delta', item_id: 'msg_fixture', output_index: outputIndex, content_index: 0, delta: text },
			{ type: 'response.output_item.done', output_index: outputIndex, item: { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] } }
		);
	}
	events.push({ type: 'response.completed', response: { id: 'resp_fixture', status: 'completed', usage: { input_tokens: 20, output_tokens: 4, total_tokens: 24 }, output: [] } });
	return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
}
