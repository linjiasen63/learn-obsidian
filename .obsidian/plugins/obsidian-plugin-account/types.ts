// 插件设置接口
export interface AccountPluginSettings {
  currency: string;
  defaultCategory: string;
}

// 默认设置
export const DEFAULT_SETTINGS: AccountPluginSettings = {
  currency: '¥',
  defaultCategory: '其他'
};

// 账单项目接口
export interface AccountItem {
  id: string;
  date: string;
  title: string;
  category: string;
  amount: number;
  type: DayEntryType;
  note?: string;
}

// 账单数据接口
export interface AccountData {
  [key: string]: any[];
}

// 单日账单条目接口
export interface DayEntry {
  id: string;
  title: string;
  type: DayEntryType;
  category: string;
  amount: number;
  note?: string;
}

// 账单条目类型
export type DayEntryType = 'income' | 'expense';

// 账单条目表单值
export interface DayEntryFormValues {
  title: string;
  type: DayEntryType;
  category: string;
  amount: number;
  note: string;
}

// 单日账单元数据
export interface DayHeadingMeta {
  date: string;
  heading: string;
  position: { start: number; end: number };
}

// 账单条目模态框选项
export interface DayEntryModalOptions {
  title: string;
  confirmLabel: string;
  initial?: Partial<DayEntry>;
  onSubmit: (values: DayEntryFormValues) => void;
}
