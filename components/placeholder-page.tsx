import { Topbar } from "@/components/topbar";
import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function PlaceholderPage({
  title,
  subtitle,
  description,
  user,
}: {
  title: string;
  subtitle: string;
  description: string;
  user: { name: string };
}) {
  return (
    <>
      <Topbar title={title} subtitle={subtitle} user={user} />
      <div className="p-8">
        <Card className="p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
          <div className="w-14 h-14 rounded-2xl bg-grad-purple flex items-center justify-center mb-4">
            <Construction className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{title}</h2>
          <p className="text-sm text-txt-secondary max-w-md">{description}</p>
        </Card>
      </div>
    </>
  );
}
