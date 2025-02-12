import classNames from "classnames";
import React, { useEffect, useState } from "react";
import Navbar from "./navbar";
import Sidebar from "./sidebar";
import BottomTab from "./bottomTab";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { defaultNavItems } from "./sideItems";
import { useUser } from "../context/UserContext";
import { ThreadPopUP } from "./threadPop";
import { useLocation, useNavigate } from "react-router-dom";

const Layout = (props) => {
  const [collapsed, setSidebarCollapsed] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebars, setSidebars] = useState(defaultNavItems);
  const [activeMenu, setActiveMenu] = useState("Home");
  const [searchPop, setSearchPop] = useState(false);
  const { user, logout } = useUser();
  const navigate = useNavigate();
  // Dynamic sidebar items based on auth state
  useEffect(() => {
    const baseItems = [...defaultNavItems];

    const authItem = user
      ? {
          label: "Logout",
          onClick: () => {
            logout();
            navigate("/", {
              replace: true,
              state: { forceRefresh: Date.now() },
            });
          },
          icon: <ArrowTopRightOnSquareIcon className="w-5 h-5" />,
        }
      : {
          label: "Login",
          onClick: () => setShowLoginPop(true),
          icon: <ArrowTopRightOnSquareIcon className="w-5 h-5" />,
        };

    setSidebars([...baseItems, authItem]);
  }, [user, navigate, logout]);
  const location = useLocation();
  const showNavbar = location?.pathname !== "/library";
  console.log("isLibraryPath", showNavbar);

  return (
    <>
      <div
        className={classNames({
          "grid bg-zinc-100 min-h-screen bg-offset": true,
          "grid-cols-sidebar": !collapsed,
          "grid-cols-sidebar-collapsed": collapsed,
          "transition-[grid-template-columns] duration-300 ease-in-out": true,
        })}
      >
        <Sidebar
          collapsed={collapsed}
          setCollapsed={setSidebarCollapsed}
          shown={showSidebar}
          navItems={sidebars}
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
          showSearchPopOverlay={() => setSearchPop(true)}
        />
        <div className="lg:mr-sm lg:mb-sm lg:mt-sm bg-background w-screen md:w-full">
          {showNavbar && (
            <Navbar onMenuButtonClick={() => setShowSidebar((prev) => !prev)} />
          )}
          {props.children}
          <BottomTab
            bottomItems={sidebars}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
        </div>
      </div>
      {searchPop && <ThreadPopUP closePop={() => setSearchPop(false)} />}
    </>
  );
};

export default Layout;
