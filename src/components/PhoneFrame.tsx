/**
 * Mobile-first shell. On phones the app fills the screen; from 481px up it
 * sits in the centered 414px frame from the approved mockup.
 */
export default function PhoneFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col min-[481px]:bg-cream">
      <div className="mx-auto flex w-full max-w-[414px] flex-1 flex-col bg-paper min-[481px]:shadow-[0_0_60px_rgba(0,0,0,0.12)]">
        {children}
      </div>
    </div>
  );
}
