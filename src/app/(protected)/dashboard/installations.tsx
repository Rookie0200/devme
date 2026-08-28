"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api, type RouterOutputs } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Installation = RouterOutputs["installation"]["list"][number];

/**
 * Fixed locale and time zone: this component renders on the server and again
 * in the browser, and a date formatted with the ambient locale differs
 * between the two.
 */
const DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function Installations(props: {
  initialData: Installation[];
  installUrl: string;
}) {
  const { data } = api.installation.list.useQuery(undefined, {
    initialData: props.initialData,
  });

  if (data.length === 0) {
    return <NoInstallations installUrl={props.installUrl} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {data.map((installation) => (
        <InstallationCard key={installation.id} installation={installation} />
      ))}
    </div>
  );
}

function NoInstallations({ installUrl }: { installUrl: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <div>
        <h2 className="font-medium">No installations yet</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          devme reviews pull requests from a GitHub App installation. Install it
          on the account or organisation whose repositories you want reviewed.
        </p>
      </div>
      <Button asChild>
        <Link href={installUrl}>Install the GitHub App</Link>
      </Button>
      <p className="text-muted-foreground text-xs">
        Just installed it? Registration can take a few seconds — reload this
        page.
      </p>
    </div>
  );
}

function InstallationCard({ installation }: { installation: Installation }) {
  const utils = api.useUtils();
  const fieldId = useId();

  const [editing, setEditing] = useState(installation.providerKey === null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const setProviderKey = api.installation.setProviderKey.useMutation({
    onSuccess: async () => {
      toast.success(`Provider key saved for ${installation.accountLogin}.`);
      setApiKey("");
      setFieldError(null);
      setEditing(false);
      await utils.installation.list.invalidate();
    },
    onError: (error) => {
      // A key the provider looked at and refused is about the value in the
      // field, so it belongs under the field. Anything else — chiefly a
      // provider we could not reach at all — is about the world, and the
      // useful response is to try again.
      if (error.data?.code === "BAD_REQUEST") {
        setFieldError(error.message);
        return;
      }
      toast.error(error.message);
    },
  });

  const removeProviderKey = api.installation.removeProviderKey.useMutation({
    onSuccess: async () => {
      toast.success(`Provider key removed from ${installation.accountLogin}.`);
      setConfirmingRemove(false);
      setEditing(true);
      await utils.installation.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const key = installation.providerKey;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{installation.accountLogin}</CardTitle>
        <CardDescription>
          {installation.accountType} ·{" "}
          {installation.repositoryCount === 1
            ? "1 repository"
            : `${installation.repositoryCount} repositories`}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {key && !editing ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-sm">••••{key.hint}</span>
              <span className="text-muted-foreground text-xs">
                {key.validatedAt
                  ? `last validated on ${DATE.format(key.validatedAt)}`
                  : "never validated"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
              >
                Replace
              </Button>

              {confirmingRemove ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={removeProviderKey.isPending}
                    onClick={() =>
                      removeProviderKey.mutate({
                        installationId: installation.id,
                      })
                    }
                  >
                    {removeProviderKey.isPending
                      ? "Removing…"
                      : "Really remove?"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingRemove(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingRemove(true)}
                >
                  Remove
                </Button>
              )}
            </div>

            {confirmingRemove && (
              <p className="text-muted-foreground text-xs">
                Reviews on this installation will stop and comment that no
                provider key is configured. The key cannot be recovered from
                here — you will need it again to undo this.
              </p>
            )}
          </>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setFieldError(null);
              setProviderKey.mutate({
                installationId: installation.id,
                apiKey,
              });
            }}
          >
            <Label htmlFor={fieldId}>Anthropic API key</Label>
            <Input
              id={fieldId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              aria-invalid={fieldError !== null}
              aria-describedby={fieldError ? `${fieldId}-error` : undefined}
            />

            {fieldError && (
              <p id={`${fieldId}-error`} className="text-destructive text-sm">
                {fieldError}
              </p>
            )}

            <p className="text-muted-foreground text-xs">
              Checked against Anthropic before it is stored, then encrypted. It
              is never shown again — only its last four characters.
            </p>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={setProviderKey.isPending || apiKey.length === 0}
              >
                {setProviderKey.isPending ? "Checking…" : "Save key"}
              </Button>

              {key && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setApiKey("");
                    setFieldError(null);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
