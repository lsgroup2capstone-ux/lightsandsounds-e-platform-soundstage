:ON ERROR EXIT
USE master;
GO
IF DB_ID(N'SoundStage') IS NULL EXEC(N'CREATE DATABASE [SoundStage]');
GO
USE [SoundStage];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.SchemaVersions', N'U') IS NULL
  CREATE TABLE dbo.SchemaVersions (Version int NOT NULL PRIMARY KEY, AppliedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.SchemaVersions WHERE Version = 1)
BEGIN
  CREATE TABLE dbo.Accounts (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Email nvarchar(254) NOT NULL,
    Role varchar(16) NOT NULL CHECK (Role IN ('client','provider','admin')),
    FirstName nvarchar(100) NOT NULL,
    LastName nvarchar(100) NOT NULL,
    Mobile nvarchar(32) NULL,
    PasswordHash varchar(512) NULL,
    AuthMethod varchar(16) NOT NULL CHECK (AuthMethod IN ('email','phone','google')),
    Business nvarchar(200) NULL,
    Bio nvarchar(max) NULL,
    ProfileImage nvarchar(max) NULL,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Accounts_Email_Role UNIQUE (Email, Role),
    CONSTRAINT CK_Accounts_EmailPassword CHECK (AuthMethod <> 'email' OR PasswordHash IS NOT NULL)
  );
  CREATE TABLE dbo.Sessions (
    TokenHash binary(32) NOT NULL PRIMARY KEY,
    AccountId uniqueidentifier NOT NULL REFERENCES dbo.Accounts(Id),
    ExpiresAt datetime2 NOT NULL,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Sessions_ExpiresAt ON dbo.Sessions(ExpiresAt);
  CREATE TABLE dbo.ProviderApplications (
    AccountId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.Accounts(Id),
    Status varchar(16) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Approved','Rejected')),
    SubmittedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ReviewedAt datetime2 NULL,
    ReviewedBy uniqueidentifier NULL REFERENCES dbo.Accounts(Id),
    Reason nvarchar(1000) NULL
  );
  CREATE TABLE dbo.ProviderDocuments (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    AccountId uniqueidentifier NOT NULL REFERENCES dbo.ProviderApplications(AccountId),
    Name nvarchar(255) NOT NULL,
    ContentType varchar(64) NOT NULL CHECK (ContentType IN ('application/pdf','image/jpeg','image/png')),
    Content varbinary(max) NOT NULL
  );
  CREATE TABLE dbo.Services (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ProviderId uniqueidentifier NOT NULL REFERENCES dbo.Accounts(Id),
    Name nvarchar(200) NOT NULL,
    Location nvarchar(200) NOT NULL,
    CoverageAreas nvarchar(max) NULL,
    TransportationFee decimal(12,2) NOT NULL DEFAULT 0 CHECK (TransportationFee >= 0),
    Description nvarchar(max) NULL,
    Price decimal(12,2) NOT NULL CHECK (Price >= 0),
    Image nvarchar(max) NULL,
    Active bit NOT NULL DEFAULT 1,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Services_ProviderId ON dbo.Services(ProviderId);
  CREATE TABLE dbo.Bookings (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Reference nvarchar(64) NOT NULL UNIQUE,
    ClientId uniqueidentifier NOT NULL REFERENCES dbo.Accounts(Id),
    ProviderId uniqueidentifier NOT NULL REFERENCES dbo.Accounts(Id),
    ServiceId uniqueidentifier NOT NULL REFERENCES dbo.Services(Id),
    PackageName nvarchar(200) NOT NULL,
    EventDate date NOT NULL,
    EventTime nvarchar(64) NULL,
    Location nvarchar(500) NOT NULL,
    Guests int NOT NULL DEFAULT 1 CHECK (Guests > 0),
    DurationDays int NOT NULL DEFAULT 1 CHECK (DurationDays > 0),
    Notes nvarchar(max) NULL,
    Total decimal(12,2) NOT NULL CHECK (Total >= 0),
    Downpayment decimal(12,2) NOT NULL CHECK (Downpayment >= 0),
    Status varchar(16) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Confirmed','Cancelled','Completed')),
    CompletedAt datetime2 NULL,
    CancelledAt datetime2 NULL,
    CancelledBy uniqueidentifier NULL REFERENCES dbo.Accounts(Id),
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Bookings_Downpayment CHECK (Downpayment <= Total)
  );
  CREATE INDEX IX_Bookings_ClientId ON dbo.Bookings(ClientId);
  CREATE INDEX IX_Bookings_ProviderDate ON dbo.Bookings(ProviderId, EventDate);
  CREATE TABLE dbo.Payments (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    BookingId uniqueidentifier NOT NULL REFERENCES dbo.Bookings(Id),
    Amount decimal(12,2) NOT NULL CHECK (Amount > 0),
    Method nvarchar(50) NOT NULL,
    Reference nvarchar(100) NULL,
    Status varchar(16) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Paid','Rejected')),
    PaidAt datetime2 NULL,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE TABLE dbo.Refunds (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    BookingId uniqueidentifier NOT NULL UNIQUE REFERENCES dbo.Bookings(Id),
    Amount decimal(12,2) NOT NULL CHECK (Amount > 0),
    Method nvarchar(50) NOT NULL,
    PayoutAccount nvarchar(255) NOT NULL,
    Status varchar(16) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Paid','Rejected')),
    Reference nvarchar(100) NULL,
    Reason nvarchar(1000) NULL,
    RequestedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ProcessedAt datetime2 NULL
  );
  CREATE TABLE dbo.Feedback (
    BookingId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.Bookings(Id),
    Rating tinyint NOT NULL CHECK (Rating BETWEEN 1 AND 5),
    Comment nvarchar(2000) NOT NULL,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE TABLE dbo.Messages (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    BookingId uniqueidentifier NOT NULL REFERENCES dbo.Bookings(Id),
    SenderId uniqueidentifier NOT NULL REFERENCES dbo.Accounts(Id),
    Body nvarchar(4000) NOT NULL,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Messages_BookingId ON dbo.Messages(BookingId, CreatedAt);
  CREATE TABLE dbo.Reports (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    BookingId uniqueidentifier NOT NULL REFERENCES dbo.Bookings(Id),
    ReporterId uniqueidentifier NOT NULL REFERENCES dbo.Accounts(Id),
    Reason nvarchar(500) NOT NULL,
    Details nvarchar(max) NULL,
    Status varchar(16) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Resolved')),
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE TABLE dbo.Subscriptions (
    ProviderId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.Accounts(Id),
    PlanName varchar(16) NULL CHECK (PlanName IN ('Starter','Pro','Studio')),
    TrialStart datetime2 NOT NULL,
    TrialEnd datetime2 NOT NULL,
    PaidUntil datetime2 NULL,
    CONSTRAINT CK_Subscriptions_Trial CHECK (TrialEnd >= TrialStart)
  );
  CREATE TABLE dbo.SubscriptionPayments (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ProviderId uniqueidentifier NOT NULL REFERENCES dbo.Accounts(Id),
    PlanName varchar(16) NOT NULL CHECK (PlanName IN ('Starter','Pro','Studio')),
    Amount decimal(12,2) NOT NULL CHECK (Amount > 0),
    Method nvarchar(50) NOT NULL,
    Reference nvarchar(100) NOT NULL,
    Status varchar(16) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Paid','Rejected')),
    Invoice nvarchar(100) NULL,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    PaidAt datetime2 NULL
  );
  CREATE TABLE dbo.Withdrawals (
    Id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ProviderId uniqueidentifier NOT NULL REFERENCES dbo.Accounts(Id),
    Amount decimal(12,2) NOT NULL CHECK (Amount > 0),
    PayoutMethod nvarchar(50) NOT NULL,
    PayoutAccount nvarchar(255) NOT NULL,
    Status varchar(16) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending','Paid','Rejected')),
    RequestedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ProcessedAt datetime2 NULL
  );
  CREATE TABLE dbo.AuditLogs (
    Id bigint IDENTITY NOT NULL PRIMARY KEY,
    ActorId uniqueidentifier NULL REFERENCES dbo.Accounts(Id),
    Action nvarchar(200) NOT NULL,
    Target nvarchar(255) NOT NULL,
    BeforeValue nvarchar(max) NULL,
    AfterValue nvarchar(max) NULL,
    CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  INSERT dbo.SchemaVersions(Version) VALUES (1);
END;
COMMIT;
GO
