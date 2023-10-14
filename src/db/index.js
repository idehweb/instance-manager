const DBCmd = {
  addUser({ user, pass, db }) {
    return `x-mongo create-user --user ${user} --pass ${pass} --db ${db} --role dbOwner`;
  },
  getConnectionUri({ user, pass, db }) {
    return `x-mongo get-uri --user ${user} --pass ${pass} --db ${db}`;
  },
  deleteUser({ user, db }) {
    return `x-mongo delete-user --user ${user} --db ${db}`;
  },
};

export default DBCmd;
