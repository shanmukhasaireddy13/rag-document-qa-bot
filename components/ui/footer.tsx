import Link from "next/link";

const builtWith = ["Next.js", "FastAPI", "FAISS Vector Search", "Sentence Transformers"];
const teamMembers = [
  { name: "Prodhosh V.S",  href: "https://github.com/PRODHOSH" },
  { name: "S. Sharan",     href: "https://www.instagram.com/sharansundarp/" },
  { name: "Ashish Reddy",  href: "https://www.instagram.com/1xcidd/" },
  { name: "Mohamed Nawaz", href: "https://www.linkedin.com/in/mohamed-nawaz-n-248257393/" },
];

export function Footer() {
  return (
    <footer className="w-full border-t border-white/8 bg-black">
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-3">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="FlashFetch" className="h-9 w-9 rounded-lg object-contain" />
              <span className="text-sm font-semibold text-white">FlashFetch</span>
            </Link>
            <p className="text-xs leading-relaxed text-white/40 max-w-xs">
              AI-powered document intelligence using Retrieval-Augmented Generation. Ask questions. Get cited answers. No hallucinations.
            </p>
          </div>

          {/* Built With */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30">Built With</h3>
            <ul className="flex flex-col gap-2">
              {builtWith.map((tech) => (
                <li key={tech} className="text-xs text-white/50">{tech}</li>
              ))}
            </ul>
          </div>

          {/* Team */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30">Team</h3>
            <ul className="flex flex-col gap-2">
              {teamMembers.map((member) => (
                <li key={member.name}>
                  <a
                    href={member.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-white/50 hover:text-white transition-colors"
                  >
                    {member.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/8 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-xs text-white/25">© 2026 FlashFetch. Built for Synthetix 4.0.</p>
          <Link
            href="/admin"
            className="text-xs text-white/15 hover:text-white/40 transition-colors"
          >
            Admin Portal
          </Link>
        </div>
      </div>
    </footer>
  );
}
