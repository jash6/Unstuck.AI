import { useEffect, useState } from "react";
import classNames from "classnames";
import { defaultNavItems } from "./sideItems";
import { ArrowLeftLine } from "./svg";
import { useUser } from "../context/UserContext";
import { LoginPop } from "./pop";
import { Link, useNavigate } from "react-router-dom";

const Sidebar = ({
  collapsed,
  navItems = defaultNavItems,
  shown,
  setCollapsed,
  activeMenu,
  setActiveMenu,
  showSearchPopOverlay,
}) => {
  const { user } = useUser();
  const [showLoginPop, setShowLoginPop] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      {showLoginPop && <LoginPop closePop={() => setShowLoginPop(false)} />}
      <div
        className={classNames({
          "bg-offset text-zinc-50 fixed md:static md:translate-x-0 z-20": true,
          "transition-all duration-300 ease-in-out hidden md:flex": true,
          "w-[220px]": !collapsed,
          "w-16": collapsed,
          "-translate-x-full": !shown,
        })}
      >
        <div
          className={classNames({
            "flex flex-col justify-between h-screen sticky inset-0 w-full": true,
          })}
        >
          {/* logo and collapse button */}
          <div
            className={classNames({
              "pt-4 pl-4 pr-2 flex items-center transition-none": true,
              "justify-between": !collapsed,
              "justify-center": collapsed,
            })}
          >
            {!collapsed && (
              <div className="h-auto group w-28 md:w-36 text-red hover:text-primary">
                <span className="ml-2 text-2xl font-bold">Unstuck AI</span>
              </div>
            )}

            <button
              className={`grid place-content-center hover:bg-offsetPlus w-8 h-8 rounded-full opacity-100 hover:fill-textMain text-extradark-gray ${
                !user && "hidden"
              }`}
              onClick={() => setCollapsed(!collapsed)}
            >
              <ArrowLeftLine />
            </button>
          </div>
          <div className="mx-3 mt-4 hidden md:block">
            <button
              type="button"
              className="bg-primary text-white hover:opacity-80 font-sans focus:outline-none outline-none outline-transparent transition duration-300 ease-in-out  select-none  relative group  justify-center text-center items-center rounded-full cursor-point active:scale-95 origin-center whitespace-nowrap flex w-full text-base px-1 font-medium h-10"
              onClick={() => navigate("/")}
            >
              <div className="flex items-center leading-none justify-center gap-xs">
                <div className="text-align-center relative">New Thread</div>
              </div>
            </button>
          </div>
          <nav className="flex-grow">
            <ul
              className={classNames({
                "my-2 flex flex-col gap-2 items-stretch": true,
              })}
            >
              {navItems?.map((item, index) => {
                return (
                  <li
                    key={index}
                    className={classNames({
                      "hover:bg-offsetPlus flex font-medium justify-between": true, //colors
                      "transition-colors duration-300": true, //animation
                      "rounded-md p-2 mx-3 gap-4 ": !collapsed,
                      "rounded-full p-2 mx-3 w-10 h-10": collapsed,
                      "text-textMain": item.label === activeMenu,
                      "text-extradark-gray": item.label !== activeMenu,
                    })}
                    onClick={() => {
                      if (item.label === "Login") {
                        setShowLoginPop(true);
                      } else if (item.onClick) {
                        item.onClick();
                      } else {
                        setActiveMenu(item.label);
                      }
                    }}
                  >
                    <Link to={item.href}>
                      <a className="flex gap-2">
                        {item.icon} <span>{!collapsed && item.label}</span>
                      </a>
                    </Link>
                    {item?.active && !collapsed && (
                      <div className="pointer-events-none relative z-10 h-4 rounded px-1 pb-1 bg-red text-white text-[11px] font-medium tracking-wide uppercase">
                        New
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div
            className={classNames({
              "grid place-content-stretch p-4 ": true,
            })}
          >
            {user && (
              <div className="flex gap-2 items-center h-11  my-2 overflow-hidden">
                {!collapsed && (
                  <a href="/" className="text-textMain font-medium text-sm">
                    {user?.username}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
export default Sidebar;
