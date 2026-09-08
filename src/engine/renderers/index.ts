import { PluginRegistry } from '../PluginRegistry';
import {
  TextRenderer,
  CodeRenderer,
  TableRenderer,
  TodoRenderer,
  QuestionRenderer,
  ThinkingRenderer,
  StatusRenderer,
  ToolCallRenderer,
} from './StandardRenderers';
import { TerminalRenderer } from './TerminalRenderer';
import { PatchRenderer } from './PatchRenderer';
import { ChartRenderer } from './ChartRenderer';
import {
  ProgressRenderer,
  StepsRenderer,
  TimelineRenderer,
  ListRenderer,
  MathRenderer,
  MermaidRenderer,
  MediaRenderer,
  SuggestionRenderer,
  ComparisonRenderer,
  CitationRenderer,
  FormRenderer,
  SearchResultRenderer,
  SkillRenderer,
  BrowserActionRenderer,
  NotificationRenderer,
  CustomWidgetRenderer,
  DividerRenderer,
  FallbackRenderer,
  FileRenderer,
  JsonRenderer,
  XmlRenderer,
} from './ExtendedRenderers';

export function registerAllPlugins() {
  // Core blocks
  PluginRegistry.register('text', TextRenderer);
  PluginRegistry.register('code', CodeRenderer);
  PluginRegistry.register('table', TableRenderer);
  PluginRegistry.register('list', ListRenderer);
  PluginRegistry.register('todo', TodoRenderer);
  PluginRegistry.register('question', QuestionRenderer);
  PluginRegistry.register('form', FormRenderer);
  PluginRegistry.register('thinking', ThinkingRenderer);
  PluginRegistry.register('tool_call', ToolCallRenderer);

  // Status blocks
  PluginRegistry.register('error', StatusRenderer);
  PluginRegistry.register('warning', StatusRenderer);
  PluginRegistry.register('success', StatusRenderer);
  PluginRegistry.register('info', StatusRenderer);

  // Rich content blocks
  PluginRegistry.register('math', MathRenderer);
  PluginRegistry.register('mermaid', MermaidRenderer);
  PluginRegistry.register('image', MediaRenderer);
  PluginRegistry.register('video', MediaRenderer);
  PluginRegistry.register('audio', MediaRenderer);
  PluginRegistry.register('citation', CitationRenderer);
  PluginRegistry.register('comparison', ComparisonRenderer);
  PluginRegistry.register('suggestion', SuggestionRenderer);
  PluginRegistry.register('progress', ProgressRenderer);
  PluginRegistry.register('steps', StepsRenderer);
  PluginRegistry.register('timeline', TimelineRenderer);
  PluginRegistry.register('json', JsonRenderer);
  PluginRegistry.register('xml', XmlRenderer);
  PluginRegistry.register('file', FileRenderer);

  // Advanced / Agent blocks
  PluginRegistry.register('terminal', TerminalRenderer);
  PluginRegistry.register('patch', PatchRenderer);
  PluginRegistry.register('chart', ChartRenderer);
  PluginRegistry.register('search_result', SearchResultRenderer);
  PluginRegistry.register('skill', SkillRenderer);
  PluginRegistry.register('browser_action', BrowserActionRenderer);
  PluginRegistry.register('notification', NotificationRenderer);
  PluginRegistry.register('custom_widget', CustomWidgetRenderer);

  // Structural
  PluginRegistry.register('divider', DividerRenderer);
  PluginRegistry.register('fallback', FallbackRenderer);
}

// Export all for convenience
export * from './StandardRenderers';
export * from './ExtendedRenderers';
export * from './TerminalRenderer';
export * from './PatchRenderer';
export * from './ChartRenderer';
