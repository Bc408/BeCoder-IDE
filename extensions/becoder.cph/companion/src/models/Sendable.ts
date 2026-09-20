// BeCoder adaptation: parsers return data only; no extension messaging or send().
export interface Sendable {
  readonly name: string;
  readonly url: string;
}
