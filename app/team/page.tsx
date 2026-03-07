import Image from "next/image";
import { Github, Linkedin, Instagram, Code2, Search, Lightbulb, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

const team = [
  {
    name: "Prodhosh V.S",
    role: "Team Lead & Developer",
    icon: Code2,
    description:
      "Drives the technical direction of the team. Architects the solution, writes core code, and keeps everyone aligned on the vision. The one who makes sure the ship does not sink - and usually the one steering it.",
    avatar: "/contributors/prodhosh_photo.jpeg",
    github: "https://github.com/PRODHOSH",
    linkedin: "https://www.linkedin.com/in/prodhoshvs/",
    flip: false,
  },
  {
    name: "S. Sharan",
    role: "Problem Solver & Researcher",
    icon: Search,
    description:
      "Breaks down complex challenges into solvable pieces. Deep-dives into research to lock in the best approach before a single line of code is written. The team's edge against ambiguity.",
    avatar: "/contributors/charan.png",
    instagram: "https://www.instagram.com/sharansundarp/",
    github: "https://github.com/AshishReddy-CH",
    flip: true,
  },
  {
    name: "Ashish Reddy",
    role: "Research Lead & Problem Solver",
    icon: Lightbulb,
    description:
      "Leads the team's research strategy and validates ideas against real-world constraints. Makes sure what we build is grounded, feasible, and does not fall apart under scrutiny.",
    avatar: "/contributors/ashish.png",
    instagram: "https://www.instagram.com/1xcidd/",
    flip: false,
  },
  {
    name: "Mohamed Nawaz",
    role: "Deployment & Design Lead",
    icon: Rocket,
    description:
      "Owns the end-to-end deployment pipeline and shapes the visual experience. The reason the product looks good and ships clean - every single time.",
    avatar: "/contributors/nawaz.png",
    github: "https://github.com/nawaz080884-sudo",
    linkedin: "https://www.linkedin.com/in/mohamed-nawaz-n-248257393/",
    flip: true,
  },
];

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-black text-white">

      {/* Header */}
      <section className="w-full pt-16 pb-10 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <span className="inline-block border border-white/10 rounded-full px-3 py-1 text-xs text-white/35 tracking-widest uppercase mb-5">
            Synthetix 4.0 &middot; Programming Track
          </span>
          <h1 className="text-4xl md:text-6xl font-bold uppercase tracking-wide mb-4 text-white" style={{ letterSpacing: '-0.03em' }}>
            Our Core
          </h1>
          <p className="text-white/45 text-sm max-w-2xl mx-auto">
            Meet the four people behind{" "}
            <span className="text-white font-semibold">FlashFetch</span> &mdash; the
            team that poured everything into 24 hours of building.
          </p>
        </div>
      </section>

      {/* Member Cards */}
      <section className="w-full px-4 sm:px-8 lg:px-16 pb-16">
        <div className="max-w-7xl mx-auto flex flex-col gap-5">
          {team.map((member) => {
            const Icon = member.icon;
            return (
              <div
                key={member.name}
                className={cn(
                  "group flex flex-col md:flex-row w-full border border-white/8 rounded-2xl overflow-hidden bg-[#0a0a0a]",
                  "transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-white/18"
                )}
                style={{ minHeight: 240 }}
              >
                {/* Photo - left */}
                {!member.flip && (
                  <div className="relative w-full md:w-64 lg:w-72 shrink-0 overflow-hidden min-h-55">
                    <Image
                      src={member.avatar}
                      alt={member.name}
                      fill
                      className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex flex-col justify-center px-8 py-8 flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 border border-white/10 rounded-full px-3 py-1 text-xs text-white/35 uppercase tracking-widest">
                      <Icon className="w-3.5 h-3.5" />
                      {member.role}
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-wide mb-3 text-white" style={{ letterSpacing: '-0.03em' }}>
                    {member.name}
                  </h2>
                  <p className="text-white/45 text-sm leading-relaxed max-w-xl">
                    {member.description}
                  </p>
                  <div className="flex gap-3 mt-5">
                    {"instagram" in member ? (
                      <a
                        href={(member as any).instagram}
                        className="text-white/30 hover:text-white transition-colors duration-200"
                        aria-label="Instagram"
                      >
                        <Instagram className="w-5 h-5" />
                      </a>
                    ) : (
                      <>
                        <a
                          href={(member as any).github}
                          className="text-white/30 hover:text-white transition-colors duration-200"
                          aria-label="GitHub"
                        >
                          <Github className="w-5 h-5" />
                        </a>
                        <a
                          href={(member as any).linkedin}
                          className="text-white/30 hover:text-white transition-colors duration-200"
                          aria-label="LinkedIn"
                        >
                          <Linkedin className="w-5 h-5" />
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {/* Photo - right */}
                {member.flip && (
                  <div className="relative w-full md:w-64 lg:w-72 shrink-0 overflow-hidden min-h-55">
                    <Image
                      src={member.avatar}
                      alt={member.name}
                      fill
                      className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom: Poster left, Shoutout right */}
      <section className="w-full px-4 sm:px-8 lg:px-16 pb-20">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-5">

          {/* Poster */}
          <div className="group lg:w-80 shrink-0 border border-white/8 rounded-2xl overflow-hidden bg-[#0a0a0a] transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-white/18">
            <div className="relative w-full h-full min-h-90">
              <Image
                src="/synthetix-poster.png"
                alt="Synthetix 4.0 Hackathon Poster"
                fill
                className="object-contain transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </div>
          </div>

          {/* Shoutout */}
          <div className="group flex-1 border border-white/8 rounded-2xl bg-[#0a0a0a] px-8 py-10 md:px-12 md:py-14 flex flex-col justify-center transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-white/18">
            <p className="text-xs uppercase tracking-[0.3em] text-white/30 mb-4">
              Shoutout
            </p>
            <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-wide mb-6 text-white" style={{ letterSpacing: '-0.03em' }}>
              HumanoidX Club
            </h2>
            <p className="text-white/45 leading-relaxed mb-4 text-sm">
              A massive shoutout to{" "}
              <span className="text-white font-semibold">HumanoidX Club</span>{" "}
              at VIT Chennai for organising the 4th edition of their flagship
              hackathon &mdash;{" "}
              <span className="text-white font-semibold">Synthetix 4.0</span>.
            </p>
            <p className="text-white/45 leading-relaxed mb-8 text-sm">
              24 hours. 3 domains. Real problems. Real solutions. The kind of
              environment that brings out the best in builders &mdash; and we are
              grateful for the opportunity to compete, create, and push our limits
              on that stage.
            </p>
            <div className="flex flex-wrap gap-2">
              {["24 Hours", "3 Domains", "Rs.15K+ Prize Pool", "VIT Chennai", "MG Auditorium", "5-6 Mar"].map((tag) => (
                <span
                  key={tag}
                  className="border border-white/10 rounded-full px-3 py-1 text-xs text-white/35 uppercase tracking-wide"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
