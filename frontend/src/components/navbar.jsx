import classNames from "classnames";

const Navbar = () => {
  return (
    <nav
      className={classNames({
        "fixed top-0 md:hidden bg-background text-zinc-500": true,
        "flex items-center justify-between": true,
        "w-screen sm:flex md:w-full z-10 px-4 shadow-sm h-[73px] top-0 ": true,
      })}
    >
      <div
        className={classNames({
          "flex items-center transition-none": true,
          "p-4 justify-between": true,
        })}
      >
        <div className="h-auto group w-28 md:w-36 hover:text-primary">
          <span className="ml-2 text-xl font-bold">Unstuck AI</span>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
