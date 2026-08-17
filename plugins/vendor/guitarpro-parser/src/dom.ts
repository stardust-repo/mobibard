/**
 * Copyright 2026 Emilien Bevierre
 * Licensed under the Apache License, Version 2.0.
 */
type DOMParserConstructor = new () => DOMParser;
export function getDOMParser(): DOMParserConstructor {
  if (typeof globalThis.DOMParser !== 'undefined') return globalThis.DOMParser;
  throw new Error('DOMParser is not available in this browser.');
}
