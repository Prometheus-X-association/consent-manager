export const now = () => {
  return new Date().toISOString();
};

export const consentEvent = {
  given: {
    get eventTime() {
      return now();
    },
    validityDuration: "0",
    eventType: "explicit",
    eventState: "consent given",
  },
  revoked: {
    get eventTime() {
      return now();
    },
    validityDuration: "0",
    eventType: "explicit",
    eventState: "consent revoked",
  },
  refused: {
    get eventTime() {
      return now();
    },
    validityDuration: "0",
    eventType: "explicit",
    eventState: "consent refused",
  },
  reConfirmed: {
    get eventTime() {
      return now();
    },
    validityDuration: "0",
    eventType: "explicit",
    eventState: "consent re-confirmed",
  },
  terminated: {
    get eventTime() {
      return now();
    },
    validityDuration: "0",
    eventType: "explicit",
    eventState: "consent terminated",
  },
};
