import { TodoColor } from './block6';

export interface RecurringTodo {
  id: string;
  text: string;
  color?: TodoColor;
  createdAt: string;
}
