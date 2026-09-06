/**
 * One result shape for all six tools.
 *
 * The JSON is the whole message: `content[0].text` is exactly `JSON.stringify(structuredContent)`
 * and nothing is wrapped in prose. That matters more here than it looks — a worker's note
 * travels inside `structuredContent.answer`, and a sentence of our own around it would be the
 * one place where untrusted text could reach an agent without its wrapper.
 */

export interface ToolTextContent {
  type: 'text';
  text: string;
}

export interface ToolResult<T> {
  content: ToolTextContent[];
  structuredContent: T;
  isError?: boolean;
}

export function toolResult<T>(result: T): ToolResult<T> {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

/**
 * A failure the agent is meant to read and act on — a missing buyer token, a hire that is not
 * wired in this build. The text is the instruction; `structuredContent` still carries the
 * dashboard URL so the agent has somewhere to send its principal.
 */
export function toolError<T>(message: string, structuredContent: T): ToolResult<T> {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent,
    isError: true,
  };
}
