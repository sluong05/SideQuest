import Link from 'next/link';

export default function Welcome() {
  return (
    <div
      className="min-h-screen bg-navy-700 relative overflow-hidden flex flex-col items-center justify-between p-10"
      style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.18) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
    >

      {/* Logo */}
      <div className="flex-1 flex items-center justify-center w-full">
        <img src="/logo.png" alt="Pushup Debt" className="w-full max-w-xl h-auto" />
      </div>

      {/* About */}
      <div className="w-full max-w-4xl space-y-8 text-center flex-1 flex flex-col justify-center">
        <p className="text-navy-100 text-4xl font-medium leading-relaxed">
          Pushup Debt is a productivity app with a twist — every task you add comes with a deadline.
          Finish on time and you're in the clear. Miss it, and you rack up <span className="text-amber-400 font-semibold">pushup debt</span>.
        </p>
        <p className="text-navy-100 text-4xl font-medium leading-relaxed">
          Let the debt pile up too high and you'll be blocked from adding new tasks until you pay it off — one pushup at a time.
          <span className="text-amber-400 font-semibold"> Procrastination has consequences.</span>
        </p>

        {/* How it works cards */}
        <div className="grid grid-cols-3 gap-6 mt-4">
          <div className="card text-center py-8">
            <p className="text-2xl text-navy-100 font-medium">Add tasks with deadlines</p>
          </div>
          <div className="card text-center py-8">
            <p className="text-2xl text-navy-100 font-medium">Miss a deadline, gain debt</p>
          </div>
          <div className="card text-center py-8">
            <p className="text-2xl text-navy-100 font-medium">Do pushups to pay it off</p>
          </div>
        </div>
      </div>

      {/* CTA buttons */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm flex-shrink-0 pb-4">
        <Link href="/signup" className="btn-primary text-center py-4 text-xl rounded-lg w-full">
          Get Started
        </Link>
        <Link href="/login" className="btn-secondary text-center py-4 text-xl rounded-lg w-full">
          Sign In
        </Link>
      </div>
    </div>
  );
}
