/**
 * Intent / response classifier.
 *
 * Runs incrementally against accumulated raw text and yields a classification
 * plus structured metadata that downstream builders/renders can use.
 */

export type ResponseClass =
  | 'conversation'
  | 'question'
  | 'confirmation'
  | 'todo'
  | 'progress'
  | 'steps'
  | 'timeline'
  | 'code'
  | 'file'
  | 'error'
  | 'warning'
  | 'success'
  | 'info'
  | 'form'
  | 'tool_call'
  | 'thinking'
  | 'search_result'
  | 'image'
  | 'video'
  | 'audio'
  | 'link_collection'
  | 'comparison'
  | 'table'
  | 'list'
  | 'checklist'
  | 'json'
  | 'xml'
  | 'terminal_output'
  | 'logs'
  | 'math'
  | 'mermaid'
  | 'diagram'
  | 'workflow'
  | 'suggestion'
  | 'citation'
  | 'patch'
  | 'skill'
  | 'browser_action'
  | 'terminal'
  | 'chart'
  | 'notification'
  | 'custom_widget'
  | 'unknown';

export interface Classification {
  class: ResponseClass;
  confidence: number;
  signals: string[];
}

const ERROR_RE = /(^|\n)((?:error|exception|failed|fatal|traceback)[:\s].*)/i;
const WARNING_RE = /(^|\n)((?:warning|warn)[:\s].*)/i;
const SUCCESS_RE = /(^|\n)((?:success|completed|done|finished)[:\s].*)/i;
const INFO_RE = /(^|\n)((?:note|info|notice)[:\s].*)/i;
const CODE_FENCE_RE = /```[\s\S]*?```/;
const CODE_INLINE_RE = /`[^`]+`/g;
const TABLE_RE = /^(?:[^\n]*\|){2,}[^\n]*$/m;
const TODO_RE = /(?:^|\n)\s*(?:[-*]\s*\[[ x]\]\s*|\d+\.\s*\[[ x]\]\s*)/;
const TODO_LINE_RE = /(?:^|\n)\s*(?:[-*])\s*\[[ x]\]\s*.+/;
const QUESTION_RE = /^(?:which|what|who|when|where|why|how|do you|can you|would you|should i|do you want|choose|select)\b/i;
const CONFIRM_RE = /^(?:do you want|would you like|should i|continue\?|yes or no|proceed\?)/i;
const FORM_FIELD_RE = /^(name|email|phone|address|password|message|subject|url|date|number)\s*[:]/i;
const MATH_RE = /\$\$[\s\S]*?\$\$|\$[^\n]+\$/;
const MERMAID_RE = /```mermaid[\s\S]*?```/i;
const JSON_RE = /```json[\s\S]*?```/i;
const XML_RE = /```xml[\s\S]*?```/i;
const THINKING_RE = /<think>[\s\S]*?<\/think>/i;
const CITATION_RE = /\[\^\d+\]/;
const PROGRESS_RE = /step\s+\d+\s+of\s+\d+/i;
const STEPS_RE = /^(?:1\.|step\s+1)/im;
const TIMELINE_RE = /\d{4}[-/]\d{2}/;
const LINK_RE = /https?:\/\/[^\s)]+/g;
const SUGGESTION_RE = /^(?:explain|summarize|continue|rewrite|show code|open file|copy|export|try again)$/im;

const PATCH_RE = /```(?:diff|patch)[\s\S]*?```/i;
const SKILL_RE = /<skill\s+[\s\S]*?<\/skill>|::skill/i;
const SEARCH_RESULT_RE = /<search_result>[\s\S]*?<\/search_result>/i;
const TERMINAL_RE = /```(?:bash|sh)[\s\S]*?```/i;
const CHART_RE = /```chart[\s\S]*?```|::chart/i;
const BROWSER_RE = /<browser_action>[\s\S]*?<\/browser_action>|::browser/i;
const WIDGET_RE = /::[a-zA-Z0-9_]+/i;

const YES_NO_CHOICES_RE = /(?:^|\n)\s*(?:yes|no)\s*(?:\/\s*(?:yes|no))?/i;
const MULTI_CHOICE_RE = /(?:^|\n)\s*(?:[a-z]\)\s|[-*]\s.*)/gim;

export function classifyResponse(raw: string): Classification {
  const signals: string[] = [];

  if (THINKING_RE.test(raw)) signals.push('thinking');
  if (ERROR_RE.test(raw)) signals.push('error');
  if (WARNING_RE.test(raw)) signals.push('warning');
  if (SUCCESS_RE.test(raw)) signals.push('success');
  
  if (PATCH_RE.test(raw)) signals.push('patch');
  if (SKILL_RE.test(raw)) signals.push('skill');
  if (SEARCH_RESULT_RE.test(raw)) signals.push('search_result');
  if (TERMINAL_RE.test(raw)) signals.push('terminal');
  if (CHART_RE.test(raw)) signals.push('chart');
  if (BROWSER_RE.test(raw)) signals.push('browser_action');
  if (WIDGET_RE.test(raw)) signals.push('custom_widget');

  if (CODE_FENCE_RE.test(raw) && !PATCH_RE.test(raw) && !TERMINAL_RE.test(raw) && !CHART_RE.test(raw)) {
    signals.push('code_fence');
  }

  if (TABLE_RE.test(raw)) signals.push('table');
  if (TODO_RE.test(raw) || TODO_LINE_RE.test(raw)) signals.push('todo');
  if (JSON_RE.test(raw)) signals.push('json');
  if (XML_RE.test(raw)) signals.push('xml');
  if (MATH_RE.test(raw)) signals.push('math');
  if (MERMAID_RE.test(raw)) signals.push('mermaid');
  if (CITATION_RE.test(raw)) signals.push('citation');
  if (PROGRESS_RE.test(raw)) signals.push('progress');
  if (TIMELINE_RE.test(raw)) signals.push('timeline');
  if (LINK_RE.test(raw)) signals.push('links');
  if (QUESTION_RE.test(raw.trim())) signals.push('question');
  if (CONFIRM_RE.test(raw.trim())) signals.push('confirmation');
  if (FORM_FIELD_RE.test(raw)) signals.push('form');

  const rawTrimmed = raw.trim();
  if (YES_NO_CHOICES_RE.test(rawTrimmed) || MULTI_CHOICE_RE.test(rawTrimmed)) {
    signals.push('choices');
  }
  if (SUGGESTION_RE.test(rawTrimmed)) signals.push('suggestion');

  let cls: ResponseClass = 'conversation';
  let confidence = 0.5;

  if (signals.includes('thinking') && !signals.some(s => ['error','warning','success','code_fence','table','todo','json','xml','math','mermaid','progress','timeline'].includes(s))) {
    cls = 'thinking';
    confidence = 0.9;
  } else if (signals.includes('patch')) {
    cls = 'patch';
    confidence = 0.9;
  } else if (signals.includes('skill')) {
    cls = 'skill';
    confidence = 0.9;
  } else if (signals.includes('search_result')) {
    cls = 'search_result';
    confidence = 0.9;
  } else if (signals.includes('terminal')) {
    cls = 'terminal';
    confidence = 0.9;
  } else if (signals.includes('chart')) {
    cls = 'chart';
    confidence = 0.9;
  } else if (signals.includes('browser_action')) {
    cls = 'browser_action';
    confidence = 0.9;
  } else if (signals.includes('custom_widget')) {
    cls = 'custom_widget';
    confidence = 0.8;
  } else if (signals.includes('error')) {
    cls = 'error';
    confidence = 0.85;
  } else if (signals.includes('warning')) {
    cls = 'warning';
    confidence = 0.8;
  } else if (signals.includes('success')) {
    cls = 'success';
    confidence = 0.8;
  } else if (signals.includes('code_fence')) {
    cls = 'code';
    confidence = 0.85;
  } else if (signals.includes('table')) {
    cls = 'table';
    confidence = 0.8;
  } else if (signals.includes('todo')) {
    cls = 'todo';
    confidence = 0.8;
  } else if (signals.includes('json')) {
    cls = 'json';
    confidence = 0.8;
  } else if (signals.includes('xml')) {
    cls = 'xml';
    confidence = 0.75;
  } else if (signals.includes('math')) {
    cls = 'math';
    confidence = 0.8;
  } else if (signals.includes('mermaid')) {
    cls = 'mermaid';
    confidence = 0.8;
  } else if (signals.includes('progress')) {
    cls = 'progress';
    confidence = 0.7;
  } else if (signals.includes('timeline')) {
    cls = 'timeline';
    confidence = 0.7;
  } else if (signals.includes('question')) {
    cls = 'question';
    confidence = 0.75;
  } else if (signals.includes('confirmation')) {
    cls = 'confirmation';
    confidence = 0.75;
  } else if (signals.includes('form')) {
    cls = 'form';
    confidence = 0.7;
  } else if (signals.includes('citation')) {
    cls = 'citation';
    confidence = 0.6;
  } else if (signals.includes('suggestion')) {
    cls = 'suggestion';
    confidence = 0.7;
  }

  return { class: cls, confidence, signals };
}
