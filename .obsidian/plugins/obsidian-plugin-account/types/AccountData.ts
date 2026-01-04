export interface AccountItem {
	id: string;
	date: string; // YYYY-MM-DD
	type: 'income' | 'expense';
	category: string;
	amount: number;
	description: string;
}

export interface AccountData {
	[month: string]: AccountItem[]; // month format: YYYY-MM
}

export interface MonthlySummary {
	totalIncome: number;
	totalExpense: number;
	balance: number;
	byCategory: Record<string, number>;
}

