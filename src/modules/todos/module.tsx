import { ListTodo } from "lucide-react";

import type { FeatureModule } from "@/modules/types";
import { TodosListView, TodoDetailView, TodoEditView } from "./TodosModule";
import {
  buildTodoIndex,
  collectTodoReminders,
  isTodoEntry,
  todoEntries,
} from "./logic";
import { TODOS_MODULE_ID } from "./types";

export const todosModule: FeatureModule = {
  id: TODOS_MODULE_ID,
  title: "Todos",
  icon: <ListTodo className="h-4 w-4" />,
  enabledByDefault: true,
  searchableByDefault: false,
  scopePrefix: "t",
  createEmpty: () => [],
  buildIndex: (items) => buildTodoIndex(todoEntries(items)),
  ListView: ({ items }) => <TodosListView items={todoEntries(items)} />,
  DetailView: ({ item }) =>
    isTodoEntry(item) ? <TodoDetailView item={item} /> : null,
  EditView: ({ item, onSave, onCancel }) => (
    <TodoEditView
      item={isTodoEntry(item) ? item : undefined}
      onCancel={onCancel}
      onSave={onSave}
    />
  ),
  collectReminders: collectTodoReminders,
};
