const { randomBytes } = require("node:crypto");
const { loadEnvConfig } = require("@next/env");
const { createClerkClient } = require("@clerk/backend");

loadEnvConfig(process.cwd());

const secretKey = process.env.CLERK_SECRET_KEY;

if (!secretKey || !secretKey.startsWith("sk_test_")) {
  throw new Error("A Clerk development CLERK_SECRET_KEY is required.");
}

const clerk = createClerkClient({ secretKey });
const nonce = randomBytes(4).toString("hex");
const stamp = "20261014";

const definitions = [
  {
    slug: "provider-one",
    firstName: "Test Provider",
    lastName: "One",
    role: "provider",
    business: "Test Provider One Events",
  },
  {
    slug: "provider-two",
    firstName: "Test Provider",
    lastName: "Two",
    role: "provider",
    business: "Test Provider Two Events",
  },
  {
    slug: "client-one",
    firstName: "Test Client",
    lastName: "One",
    role: "client",
    business: "",
  },
  {
    slug: "client-two",
    firstName: "Test Client",
    lastName: "Two",
    role: "client",
    business: "",
  },
];

function makePassword() {
  return `Ss!${randomBytes(18).toString("base64url")}9a`;
}

async function main() {
  const created = [];

  try {
    for (const definition of definitions) {
      const email = `soundstage-${definition.slug}+clerk_test_${stamp}_${nonce}@example.com`;
      const existing = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });

      if (existing.totalCount !== 0) {
        throw new Error(`Refusing to reuse an existing Clerk user: ${email}`);
      }

      const password = makePassword();
      const user = await clerk.users.createUser({
        emailAddress: [email],
        password,
        firstName: definition.firstName,
        lastName: definition.lastName,
        publicMetadata: { role: definition.role },
        unsafeMetadata: {
          mobile: "",
          business: definition.business,
        },
      });

      const record = {
        email,
        password,
        clerkUserId: user.id,
        role: definition.role,
        firstName: definition.firstName,
        lastName: definition.lastName,
        business: definition.business,
      };
      created.push(record);

      const primaryEmail = user.emailAddresses.find(
        (address) => address.id === user.primaryEmailAddressId,
      );

      if (
        primaryEmail?.emailAddress !== email ||
        user.publicMetadata?.role !== definition.role ||
        !user.passwordEnabled
      ) {
        throw new Error(`Clerk verification failed after creating ${email}`);
      }
    }

    process.stdout.write(`${JSON.stringify({ created }, null, 2)}\n`);
  } catch (error) {
    await Promise.allSettled(
      created.map(({ clerkUserId }) => clerk.users.deleteUser(clerkUserId)),
    );
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
