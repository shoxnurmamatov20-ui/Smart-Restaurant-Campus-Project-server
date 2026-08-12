<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff.staff_members', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained('public.tenants')->cascadeOnDelete();
            $table->unsignedBigInteger('user_id')->nullable()->comment('Linked login account, if any');
            $table->string('employee_code', 32);
            $table->string('first_name', 120);
            $table->string('last_name', 120);
            $table->string('phone', 32)->nullable();
            $table->string('position', 64)->comment('waiter');
            $table->string('branch_code', 32)->nullable();
            $table->unsignedBigInteger('hourly_rate')->default(0)->comment('Tiyin per hour');
            $table->string('status', 16)->default('active')->comment('active');
            $table->date('hired_at')->nullable();
            $table->date('terminated_at')->nullable();
            $table->date('health_book_expires_at')->nullable()->comment('Sanitary book — a HACCP requirement');
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'employee_code']);
            $table->index(['tenant_id', 'status', 'position']);
            $table->index(['tenant_id', 'branch_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff.staff_members');
    }
};
