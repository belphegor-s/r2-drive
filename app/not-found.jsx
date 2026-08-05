import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="relative z-10 text-center p-8 px-4 md:p-12 w-full min-h-screen flex items-center justify-center bg-base text-[#f5f5f5]">
      <div>
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl mb-6">Oops! The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link
          href="/"
          className="w-full cursor-pointer flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-500 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
