import { XMarkIcon } from "@heroicons/react/24/outline";
import { useGoogleLogin } from "@react-oauth/google";
import { useUser } from "../context/UserContext";
import { AppleIcon, GoogleIcon } from "./svg";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

export const LoginPop = ({ closePop }) => {
  const { login: localLogin, user } = useUser();
  const navigate = useNavigate();
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      console.log(tokenResponse);
      // Define the URL of the userinfo endpoint
      const userInfoUrl = "https://www.googleapis.com/oauth2/v1/userinfo";

      // Create headers with the Authorization header containing the access token
      const headers = new Headers();
      headers.append("Authorization", `Bearer ${tokenResponse?.access_token}`);

      // Make a GET request to the userinfo endpoint
      fetch(userInfoUrl, {
        method: "GET",
        headers: headers,
      })
        .then((response) => {
          if (response.ok) {
            return response.json();
          } else {
            throw new Error("Failed to fetch user profile.");
          }
        })
        .then((profileData) => {
          // Handle the user profile data here
          console.log(profileData);
          localLogin(profileData);
          closePop();
          toast.success("Authenication successfull !!");
          navigate("/onboarding");
        })
        .catch((error) => {
          toast.error("Authenication failed !!");
          console.error("Error fetching user profile:", error);
        });
    },
    onError: (error) => window.alert(error),
  });
  return (
    <>
      <div className="bg-black/80 fixed top-0 left-0 bottom-0 right-0 z-[250] transition-all duration-5000 items-center animate-in fade-in duration-300"></div>
      <div className="flex justify-center fixed top-0 left-0 bottom-0 right-0 z-[250] items-center">
        <div className="bg-background md:w-full  shadow-md  overflow-auto animate-in fade-in  md:rounded-lg md:min-w-[600px] max-w-screen-sm relative zoom-in-95 duration-300">
          <div className="fixed z-[282] md:absolute top-sm right-sm">
            <button
              type="button"
              className="bg-offsetPlus text-textMain md:hover:text-textOff focus:outline-none outline-none outline-transparent transition duration-300 ease-in-out font-sans  select-none relative group  justify-center text-center items-center rounded-full cursor-point active:scale-95 origin-center whitespace-nowrap inline-flex text-sm aspect-square h-8"
              onClick={() => closePop()}
            >
              <div className="flex items-center leading-none justify-center gap-xs">
                <XMarkIcon className="h-4 w-4 stroke-[2.5px]" />
              </div>
            </button>
          </div>
          <div className="flex flex-col h-full">
            <div className="py-md px-md md:px-xl grow md:pt-xl md:pb-xl">
              <div className="text-center super font-display text-4xl md:text-6xl text-super selection:bg-superDuper selection:text-textMain">
                Welcome
              </div>
              <div>
                <div className="text-center mt-2 default font-sans text-base text-textMain selection:bg-superDuper selection:text-textMain">
                  Sign in or sign up to continue
                </div>
                <div className="max-w-sm mx-auto mt-lg">
                  <div className="space-y-sm">
                    <button
                      type="button"
                      className="bg-offsetPlus gap-xs text-textMain md:hover:text-textOff  font-sans focus:outline-none outline-none outline-transparent transition duration-300 ease-in-out  select-none relative group  justify-center text-center items-center rounded-full cursor-point active:scale-95 origin-center whitespace-nowrap flex w-full text-base px-md font-medium h-10"
                      onClick={() => login()}
                    >
                      <GoogleIcon className="w-5 h-4" />
                      Continue with Google
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
