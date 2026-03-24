import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { useState, useEffect, useContext } from "react";
import { FamilyContext } from "../contexts/FamilyContext";
import { cn } from "./ui/utils";

export function ChildSelector() {
  const [open, setOpen] = useState(false);
  
  // Use useContext directly to handle cases where provider might not be ready
  const familyContext = useContext(FamilyContext);
  
  // If context is not available yet, show a loading state
  if (!familyContext) {
    return (
      <Button variant="outline" disabled className="w-[200px]">
        Loading...
      </Button>
    );
  }
  
  const { children, selectedChildId, setSelectedChildId, familyId, isLoading } = familyContext;

  // DEBUG: Log children state
  useEffect(() => {
    console.log('🔍 ChildSelector - State:', {
      childrenCount: children.length,
      children: children.map(c => ({ id: c.id, name: c.name })),
      selectedChildId,
      familyId,
      isLoading
    });
  }, [children, selectedChildId, familyId, isLoading]);

  const selectedChild = children.find(c => c.id === selectedChildId);

  // ✅ SEL-001: Hide selector when only one child
  if (children.length === 1 && selectedChild) {
    return (
      <div className="flex items-center gap-2" data-testid="single-child-display">
        <span className="text-sm font-medium" data-testid="selected-child-name">
          {selectedChild.name}
        </span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          {isLoading ? "Loading..." : selectedChild ? selectedChild.name : children.length === 0 ? "No children yet" : "Select child..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandList>
            <CommandEmpty>
              {children.length === 0 ? "No children added yet. Go to Settings to add a child." : "No child found."}
            </CommandEmpty>
            <CommandGroup>
              {children.map((child) => (
                <CommandItem
                  key={child.id}
                  value={child.name}
                  onSelect={() => {
                    setSelectedChildId(child.id === selectedChildId ? null : child.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedChildId === child.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {child.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}