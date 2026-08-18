"use client"

import { useState } from "react"
import { Check, Copy, Download, Waypoints } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mufaName: string
  schema: unknown
}

export function MufaSchemaDialog({ open, onOpenChange, mufaName, schema }: Props) {
  const [copied, setCopied] = useState(false)
  const json = JSON.stringify(schema, null, 2)

  async function handleCopy() {
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleDownload() {
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `esquema-${mufaName || "mufa"}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Waypoints className="size-5" />
          </span>
          <div>
            <DialogTitle>Esquema de empalme — {mufaName}</DialogTitle>
            <DialogDescription>Cables, buffers, hilos y bandejas de fusión de esta mufa.</DialogDescription>
          </div>
        </div>

        <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-border bg-muted/50 p-3 text-xs text-foreground">
          {json}
        </pre>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleCopy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button type="button" onClick={handleDownload}>
            <Download className="size-3.5" />
            Descargar JSON
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
