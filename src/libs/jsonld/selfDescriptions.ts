import { IUser } from "../../types/models";

export const userToSelfDescription = (user: IUser) => {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    url: `${process.env.URL}${
      process.env.NODE_ENV === "development" ? `:${process.env.PORT}` : ""
    }/v1/users/${user.id}`,
  };

  return JSON.stringify(jsonLd, null, 2);
};
