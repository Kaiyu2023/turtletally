import type { CategoryGroup, TransactionFlow, TransactionKind, TransactionOrigin } from '../data/types';
import { defineMessages, useMessages, type MessageCatalog } from './locale';

// The vocabulary for each domain enum, defined once. `satisfies` makes a new
// enum member a compile error here rather than a missing label at runtime.
export const domainMessages = defineMessages(
  {
    spending: 'Spending',
    income: 'Income',
    investment: 'Investment',
    debit: 'Debit',
    credit: 'Credit',
    manual: 'Manual',
    imported: 'Imported',
    scheduled: 'Scheduled',
    assistant: 'Assistant',
    groupShopping: 'Shopping',
    groupRent: 'Rent',
    groupUtilities: 'Utilities',
    groupServices: 'Services',
    groupTax: 'Tax',
    groupTransport: 'Transport',
    groupIncome: 'Income',
    groupInvestment: 'Investment',
  },
  {
    spending: '支出',
    income: '收入',
    investment: '投资',
    debit: '流出',
    credit: '流入',
    manual: '手动',
    imported: '导入',
    scheduled: '计划',
    assistant: '助手',
    groupShopping: '购物',
    groupRent: '房租',
    groupUtilities: '水电燃气',
    groupServices: '服务',
    groupTax: '税费',
    groupTransport: '交通',
    groupIncome: '收入',
    groupInvestment: '投资',
  },
);

type DomainKey = keyof (typeof domainMessages)['en-GB'];

const kindKeys = {
  SPENDING: 'spending',
  INCOME: 'income',
  INVESTMENT: 'investment',
} satisfies Record<TransactionKind, DomainKey>;

const flowKeys = {
  DEBIT: 'debit',
  CREDIT: 'credit',
} satisfies Record<TransactionFlow, DomainKey>;

const originKeys = {
  MANUAL: 'manual',
  IMPORT: 'imported',
  SCHEDULE: 'scheduled',
  ASSISTANT: 'assistant',
} satisfies Record<TransactionOrigin, DomainKey>;

const groupKeys = {
  Shopping: 'groupShopping',
  Rent: 'groupRent',
  Utilities: 'groupUtilities',
  Services: 'groupServices',
  Tax: 'groupTax',
  Transport: 'groupTransport',
  Income: 'groupIncome',
  Investment: 'groupInvestment',
} satisfies Record<CategoryGroup, DomainKey>;

export function useDomainMessages() {
  const t = useMessages(domainMessages as MessageCatalog<DomainKey>);
  return {
    kind: (value: TransactionKind) => t(kindKeys[value]),
    flow: (value: TransactionFlow) => t(flowKeys[value]),
    origin: (value: TransactionOrigin) => t(originKeys[value]),
    group: (value: CategoryGroup) => t(groupKeys[value]),
  };
}
