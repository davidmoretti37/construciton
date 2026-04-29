"use client";

import { useState } from "react";
import Input from "@/components/ui/Input";
import Label from "@/components/ui/Label";

interface Props {
  defaultName?: string;
  defaultPhone?: string;
  defaultEmail?: string;
  errors?: { name?: string; phone?: string; email?: string };
}

export default function ClientPicker({ defaultName, defaultPhone, defaultEmail, errors }: Props) {
  const [name, setName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="client_name" optional>Client name</Label>
        <Input
          id="client_name"
          name="client_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lin & Daniela Park"
          invalid={!!errors?.name}
        />
        {errors?.name && <p className="text-[12px] text-[#ff3b30] mt-1.5">{errors.name}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="client_phone" optional>Phone</Label>
          <Input
            id="client_phone"
            name="client_phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-1234"
            invalid={!!errors?.phone}
          />
          {errors?.phone && <p className="text-[12px] text-[#ff3b30] mt-1.5">{errors.phone}</p>}
        </div>
        <div>
          <Label htmlFor="client_email" optional>Email</Label>
          <Input
            id="client_email"
            name="client_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            invalid={!!errors?.email}
          />
          {errors?.email && <p className="text-[12px] text-[#ff3b30] mt-1.5">{errors.email}</p>}
        </div>
      </div>
      {(name || phone || email) && (
        <div className="bg-[#fbfbfd] ring-1 ring-[#e5e5ea] rounded-[10px] p-3 text-[12px] text-[#6e6e73] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0071e3] to-[#005bb5] text-white flex items-center justify-center font-semibold text-[11px] shrink-0">
            {(name.split(" ").map((s) => s[0]).join("").slice(0, 2) || "?").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#1d1d1f] truncate">
              {name || "Unnamed client"}
            </p>
            <p className="font-mono tabular-nums truncate">
              {[phone, email].filter(Boolean).join(" · ") || "No contact info"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
