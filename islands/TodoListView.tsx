import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { TodoList, TodoListItem } from "../shared/api.ts";
import axios from "axios-web";

interface LocalMutation {
  text: string | null;
  completed: boolean;
}

export default function TodoListView(
  props: { initialData: TodoList; latency: number },
) {
  const [data, setData] = useState(props.initialData);
  const [dirty, setDirty] = useState(false);
  const localMutations = useRef(new Map<string, LocalMutation>());
  const [hasLocalMutations, setHasLocalMutations] = useState(false);
  const busy = hasLocalMutations || dirty;
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let es = new EventSource(window.location.href);

    es.addEventListener("message", (e) => {
      const newData: TodoList = JSON.parse(e.data);
      setData(newData);
      setDirty(false);
      setAdding(false);
    });

    es.addEventListener("error", async () => {
      es.close();
      const backoff = 10000 + Math.random() * 5000;
      await new Promise((resolve) => setTimeout(resolve, backoff));
      es = new EventSource(window.location.href);
    });
  }, []);

  useEffect(() => {
    (async () => {
      while (1) {
        const mutations = Array.from(localMutations.current);
        localMutations.current = new Map();
        setHasLocalMutations(false);

        if (mutations.length) {
          setDirty(true);
          const chunkSize = 10;
          for (let i = 0; i < mutations.length; i += chunkSize) {
            const chunk = mutations.slice(i, i + chunkSize).map((
              [id, mut],
            ) => ({
              id,
              text: mut.text,
              completed: mut.completed,
            }));
            while (true) {
              try {
                await axios.post(window.location.href, chunk);
                break;
              } catch {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          }
        }

        await new Promise((resolve) =>
          setTimeout(
            () => requestAnimationFrame(resolve), // pause when the page is hidden
            1000,
          )
        );
      }
    })();
  }, []);

  const addTodoInput = useRef<HTMLInputElement>(null);
  const addTodo = useCallback(() => {
    const value = addTodoInput.current!.value;
    if (!value) return;
    addTodoInput.current!.value = "";

    const id = generateItemId();
    localMutations.current.set(id, {
      text: value,
      completed: false,
    });
    setHasLocalMutations(true);
    setAdding(true);
  }, []);

  const saveTodo = useCallback(
    (item: TodoListItem, text: string | null, completed: boolean) => {
      localMutations.current.set(item.id!, {
        text,
        completed,
      });
      setHasLocalMutations(true);
    },
    [],
  );

  return (
   <div class="flex flex-col w-full h-full items-center justify-center p-4 bg-gray-100">
    <div class="rounded-lg shadow-lg w-full max-w-md bg-white p-4">
      <h1 class="text-center font-bold text-2xl mb-4">Task List</h1>
      <div class="mb-4 flex items-center justify-between">
        <p class="text-sm opacity-80">Share to collaborate</p>
        <div class={`h-3 w-3 rounded-full ${busy ? "bg-yellow-500" : "bg-green-500"}`}></div>
      </div>
      <div class="flex items-center mb-4">
        <input class="flex-grow rounded-lg p-2 shadow-sm border" placeholder="New task..." ref={addTodoInput} />
        <button class="ml-2 p-2 bg-blue-600 text-white rounded-lg shadow-sm" onClick={addTodo} disabled={adding}>
          +
        </button>
      </div>
      <div class="divide-y divide-gray-300">
        {data.items.map((item) => (
          <TodoItem key={item.id! + ":" + item.versionstamp!} item={item} save={saveTodo} />
        ))}
      </div>
      <div class="mt-6 text-center text-sm opacity-50">
        <p>Fetched in {props.latency}ms</p>
        <p>
          <a href="https://github.com/denoland/showcase_todo" class="underline">Source</a>
        </p>
      </div>
    </div>
  </div>
  );
}

function TodoItem(
  { item, save }: {
    item: TodoListItem;
    save: (item: TodoListItem, text: string | null, completed: boolean) => void;
  },
) {
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const doSave = useCallback(() => {
    if (!input.current) return;
    setBusy(true);
    save(item, input.current.value, item.completed);
  }, [item]);
  const cancelEdit = useCallback(() => {
    if (!input.current) return;
    setEditing(false);
    input.current.value = item.text;
  }, []);
  const doDelete = useCallback(() => {
    const yes = confirm("Are you sure you want to delete this item?");
    if (!yes) return;
    setBusy(true);
    save(item, null, item.completed);
  }, [item]);
  const doSaveCompleted = useCallback((completed: boolean) => {
    setBusy(true);
    save(item, item.text, completed);
  }, [item]);

  return (
    <div
      class="flex my-2 border-b border-gray-300 items-center h-16"
      {...{ "data-item-id": item.id! }}
    >
      {editing && (
        <>
          <input
            class="border rounded w-full py-2 px-3 mr-4"
            ref={input}
            defaultValue={item.text}
          />
          <button
            class="p-2 rounded mr-2 disabled:opacity-50"
            title="Save"
            onClick={doSave}
            disabled={busy}
          >
            💾
          </button>
          <button
            class="p-2 rounded disabled:opacity-50"
            title="Cancel"
            onClick={cancelEdit}
            disabled={busy}
          >
            🚫
          </button>
        </>
      )}
      {!editing && (
        <>
          <input
            type="checkbox"
            checked={item.completed}
            disabled={busy}
            onChange={(e) => doSaveCompleted(e.currentTarget.checked)}
            class="mr-2"
          />
          <div class="flex flex-col w-full font-mono">
            <p>
              {item.text}
            </p>
            <p class="text-xs opacity-50 leading-loose">
              {new Date(item.createdAt).toISOString()}
            </p>
          </div>
          <button
            class="p-2 mr-2 disabled:opacity-50"
            title="Edit"
            onClick={() => setEditing(true)}
            disabled={busy}
          >
            ✏️
          </button>
          <button
            class="p-2 disabled:opacity-50"
            title="Delete"
            onClick={doDelete}
            disabled={busy}
          >
            🗑️
          </button>
        </>
      )}
    </div>
  );
}

function generateItemId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}
