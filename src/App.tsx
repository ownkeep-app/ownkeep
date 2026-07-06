import { Command, CommandInput } from "@/components/ui/command";
import { useShellStore } from "@/stores/shell-store";

function App() {
  const query = useShellStore((state) => state.query);
  const setQuery = useShellStore((state) => state.setQuery);

  return (
    <main className="flex h-screen items-center justify-center overflow-hidden bg-background px-5 py-2 text-foreground">
      <section className="w-full max-w-2xl">
        <Command
          className="rounded-lg border border-border shadow-sm"
          label="Search keystash"
        >
          <CommandInput
            aria-label="Search keystash"
            autoFocus
            className="h-16 text-xl"
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
