/*---------------------------------------------------------------------------------------------
 *  Derived from Competitive Companion. Copyright (c) 2017 Jasper van Merle.
 *  Licensed under the MIT License. See companion/LICENSE and UPSTREAM.md.
 *--------------------------------------------------------------------------------------------*/
// Adapted from Competitive Companion (MIT), pinned source in UPSTREAM.md.
// Browser extension messaging and Java naming are intentionally not included.
export class TaskBuilder {
  name='';
  group: string;
  url='';
  interactive=false;
  memoryLimit=1024;
  timeLimit=1000;
  tests: { input: string; output: string }[]=[];
  input: { type: string; fileName?: string }={ type: 'stdin' };
  output: { type: string; fileName?: string }={ type: 'stdout' };
  constructor(private readonly judge: string) { this.group=judge; }
  setName(value: string): this { this.name=value; return this; }
  setCategory(value: string): this { this.group=value.trim() ? `${this.judge} - ${value}` : this.judge; return this; }
  setUrl(value: string): this { this.url=value; return this; }
  setInteractive(value: boolean): this { this.interactive=value; return this; }
  setMemoryLimit(value: number): this { this.memoryLimit=Math.floor(value); return this; }
  setTimeLimit(value: number): this { this.timeLimit=Math.floor(value); return this; }
  setInput(value: { type: string; fileName?: string }): this { this.input=value; return this; }
  setOutput(value: { type: string; fileName?: string }): this { this.output=value; return this; }
  addTest(input: string, output: string): this {
    const normalize=(text: string) => {
      const data=text.replace(/<br\s*\/?\s*>/gi, '\n').replace(/\r\n/g, '\n');
      return !data || data.endsWith('\n') ? data : `${data}\n`;
    };
    this.tests.push({ input: normalize(input), output: normalize(output) });
    return this;
  }
  build() {
    return { name: this.name, group: this.group, url: this.url, interactive: this.interactive,
      memoryLimit: this.memoryLimit, timeLimit: this.timeLimit, tests: this.tests,
      input: this.input, output: this.output, testType: 'single',
      batch: { id: crypto.randomUUID(), size: 1 } };
  }
}
