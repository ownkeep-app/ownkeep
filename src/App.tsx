import { Command, CommandInput } from "@/components/ui/command";
import { useShellStore } from "@/stores/shell-store";

function App() {
  const query = useShellStore((state) => state.query);
  const setQuery = useShellStore((state) => state.setQuery);

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-16 text-foreground">
      <section className="w-full max-w-2xl">
        <h1 className="mb-4 text-2xl font-semibold">keystash</h1>
        <Command
          className="border border-border shadow-sm"
          label="Search keystash"
        >
          <CommandInput
            aria-label="Search keystash"
            autoFocus
            onValueChange={setQuery}
            placeholder="Search keystash"
            value={query}
          />
        </Command>
      </section>
    </main>
  );
}

export default App;
