// Obsidian 类型扩展
declare module 'obsidian' {
	interface HTMLElement {
		empty(): void;
		addClass(cls: string): HTMLElement;
		createDiv(cls?: string, callback?: (el: HTMLElement) => void): HTMLElement;
		createEl<K extends keyof HTMLElementTagNameMap>(
			tag: K,
			options?: {
				text?: string;
				cls?: string;
				attr?: Record<string, string>;
			}
		): HTMLElementTagNameMap[K];
		createSpan(options?: { text?: string; cls?: string }): HTMLSpanElement;
	}
}

