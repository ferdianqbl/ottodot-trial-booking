"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setPersona, usePersona } from "@/hooks/use-persona";
import { trpc } from "@/lib/trpc/client";

/** Demo stand-in for sign-in: choose which parent (or staff) this tab acts as. */
export default function PersonaSwitcher() {
  const persona = usePersona();
  const queryClient = useQueryClient();
  const { data: response } = trpc.demo.personas.useQuery();
  const parents = response?.data;

  // A fresh tab acts as the first parent.
  useEffect(() => {
    if (!persona && parents?.[0]) setPersona(parents[0].id);
  }, [persona, parents]);

  const change = (value: string) => {
    setPersona(value);
    queryClient.resetQueries(); // drop the previous persona's data and refetch
  };

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="persona" className="text-caption font-normal text-muted-foreground max-sm:sr-only">
        Acting as
      </Label>
      <Select value={persona ?? ""} onValueChange={change}>
        <SelectTrigger id="persona" size="sm" className="min-w-52">
          <SelectValue placeholder="Choose who you are" />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          <SelectGroup>
            <SelectLabel>Parents</SelectLabel>
            {parents?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.students.map((s) => s.name.split(" ")[0]).join(", ")})
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Ottodot</SelectLabel>
            <SelectItem value="staff">Staff (teacher / ops)</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
