import { PublicOnboardingForm } from "@/components/onboarding/PublicOnboardingForm";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicOnboardingForm token={token} />;
}
